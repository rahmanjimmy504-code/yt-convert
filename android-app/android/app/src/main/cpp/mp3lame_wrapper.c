// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * JNI bridge between Mp3Encoder.kt and the bundled LAME encoder
 * (LGPL-2.1-or-later, vendored under ./lame). One opaque handle per encoder
 * instance; interleaved PCM16 in, MP3 bytes out. Streaming-safe: the VBR/
 * Info tag writer is disabled so output is a plain CBR byte stream.
 */
#include <jni.h>
#include <lame.h>
#include <stdint.h>
#include <stdlib.h>

/* Keep LAME's diagnostics off the Android log; errors surface as codes. */
static void noop_report(const char *format, va_list args)
{
    (void) format;
    (void) args;
}

struct yt_mp3_encoder {
    lame_t gfp;
};

JNIEXPORT jlong JNICALL
Java_io_github_rahmanjimmy504_ytconvert_plugins_ytextractor_Mp3Encoder_nativeOpen(
        JNIEnv *env, jobject thiz,
        jint inSampleRate, jint channels, jint outSampleRate, jint bitrateBps, jint quality)
{
    (void) thiz;
    if (inSampleRate <= 0 || outSampleRate <= 0 || (channels != 1 && channels != 2) ||
        bitrateBps < 8000 || quality < 0 || quality > 9) {
        return 0;
    }
    lame_t gfp = lame_init();
    if (gfp == NULL) {
        return 0;
    }
    lame_set_in_samplerate(gfp, (int) inSampleRate);
    lame_set_num_channels(gfp, (int) channels);
    lame_set_out_samplerate(gfp, (int) outSampleRate);
    lame_set_brate(gfp, (int) (bitrateBps / 1000));
    lame_set_quality(gfp, (int) quality);
    if (channels == 1) {
        lame_set_mode(gfp, MONO);
    }
    /* Streaming: no seekable output, so no Xing/Info frame, no gapless info. */
    lame_set_bWriteVbrTag(gfp, 0);
    lame_set_errorf(gfp, noop_report);
    lame_set_debugf(gfp, noop_report);
    lame_set_msgf(gfp, noop_report);
    if (lame_init_params(gfp) < 0) {
        lame_close(gfp);
        return 0;
    }
    struct yt_mp3_encoder *enc = malloc(sizeof(struct yt_mp3_encoder));
    if (enc == NULL) {
        lame_close(gfp);
        return 0;
    }
    enc->gfp = gfp;
    return (jlong) (intptr_t) enc;
}

JNIEXPORT jint JNICALL
Java_io_github_rahmanjimmy504_ytconvert_plugins_ytextractor_Mp3Encoder_nativeEncode(
        JNIEnv *env, jobject thiz,
        jlong handle, jshortArray pcm, jint framesPerChannel, jbyteArray out)
{
    (void) thiz;
    if (handle == 0 || pcm == NULL || out == NULL || framesPerChannel <= 0) {
        return -1;
    }
    struct yt_mp3_encoder *enc = (struct yt_mp3_encoder *) (intptr_t) handle;
    jsize outCap = (*env)->GetArrayLength(env, out);
    jshort *src = (*env)->GetShortArrayElements(env, pcm, NULL);
    if (src == NULL) {
        return -1;
    }
    jbyte *dst = (*env)->GetByteArrayElements(env, out, NULL);
    if (dst == NULL) {
        (*env)->ReleaseShortArrayElements(env, pcm, src, JNI_ABORT);
        return -1;
    }
    jint written = lame_encode_buffer_interleaved(
            enc->gfp, src, (int) framesPerChannel, (unsigned char *) dst, (int) outCap);
    (*env)->ReleaseShortArrayElements(env, pcm, src, JNI_ABORT);
    (*env)->ReleaseByteArrayElements(env, out, dst, 0);
    return written;
}

JNIEXPORT jint JNICALL
Java_io_github_rahmanjimmy504_ytconvert_plugins_ytextractor_Mp3Encoder_nativeFlush(
        JNIEnv *env, jobject thiz, jlong handle, jbyteArray out)
{
    (void) thiz;
    if (handle == 0 || out == NULL) {
        return -1;
    }
    struct yt_mp3_encoder *enc = (struct yt_mp3_encoder *) (intptr_t) handle;
    jsize outCap = (*env)->GetArrayLength(env, out);
    jbyte *dst = (*env)->GetByteArrayElements(env, out, NULL);
    if (dst == NULL) {
        return -1;
    }
    jint written = lame_encode_flush(enc->gfp, (unsigned char *) dst, (int) outCap);
    (*env)->ReleaseByteArrayElements(env, out, dst, 0);
    return written;
}

JNIEXPORT void JNICALL
Java_io_github_rahmanjimmy504_ytconvert_plugins_ytextractor_Mp3Encoder_nativeClose(
        JNIEnv *env, jobject thiz, jlong handle)
{
    (void) env;
    (void) thiz;
    if (handle == 0) {
        return;
    }
    struct yt_mp3_encoder *enc = (struct yt_mp3_encoder *) (intptr_t) handle;
    lame_close(enc->gfp);
    free(enc);
}
