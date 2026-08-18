# Vendored LAME MP3 encoder

This directory carries the **LAME** (LAME Ain't an MP3 Encoder) sources, used
for the app's MP3 audio output. Android ships no framework MP3 encoder, so the
on-device MP3 target is real only because LAME is bundled here.

- **Upstream:** <https://lame.sourceforge.io/>
- **Version:** 3.100 (the final upstream release)
- **License:** LGPL-2.1-or-later — see [`COPYING`](COPYING) (LGPL text) and
  [`LICENSE`](LICENSE) (upstream additional terms). Both files are vendored
  unmodified, as required for source distribution of LGPL code.
- **Provenance:** pristine `lame-3.100` source distribution, trimmed to what
  the build links (see `../CMakeLists.txt`): `include/lame.h`,
  `libmp3lame/**` and `mpglib/**` minus autotools files, NASM assembler
  (`libmp3lame/i386/`, unused — the C implementations build instead) and the
  docs/frontend. No upstream file is modified; the only added files in this
  tree are this README and the build files one level up (`config.h.in` +
  `CMakeLists.txt`), which generate the `config.h` LAME's autotools would
  normally produce.

The library is statically linked into `libytconvert_mp3.so` and reached from
Kotlin through the JNI wrapper in `../mp3lame_wrapper.c` (see
`Mp3Encoder.kt`). Because LGPL code is statically linked, the app's source
(including this tree) satisfies the "offer the corresponding source"
obligation via the project's public source repository.
