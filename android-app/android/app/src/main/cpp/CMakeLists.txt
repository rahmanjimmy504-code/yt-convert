# SPDX-License-Identifier: GPL-3.0-or-later
# Builds libytconvert_mp3.so: the JNI wrapper (mp3lame_wrapper.c) linked
# against the vendored LAME 3.100 encoder (lame/, LGPL-2.1-or-later).
cmake_minimum_required(VERSION 3.22.1)
project(ytconvert_mp3 LANGUAGES C)

set(LAME_DIR ${CMAKE_CURRENT_SOURCE_DIR}/lame)

# ---- config.h for LAME (per-ABI type sizes, probed headers) ----
include(CheckIncludeFile)
include(CheckTypeSize)

check_include_file(sys/types.h HAVE_SYS_TYPES_H)
check_include_file(sys/stat.h HAVE_SYS_STAT_H)
check_include_file(stdlib.h HAVE_STDLIB_H)
check_include_file(string.h HAVE_STRING_H)
check_include_file(memory.h HAVE_MEMORY_H)
check_include_file(strings.h HAVE_STRINGS_H)
check_include_file(inttypes.h HAVE_INTTYPES_H)
check_include_file(stdint.h HAVE_STDINT_H)
check_include_file(unistd.h HAVE_UNISTD_H)
check_include_file(errno.h HAVE_ERRNO_H)
check_include_file(fcntl.h HAVE_FCNTL_H)
check_include_file(limits.h HAVE_LIMITS_H)
check_include_file(fenv.h HAVE_FENV_H)

check_type_size("short" SIZEOF_SHORT)
check_type_size("int" SIZEOF_INT)
check_type_size("long" SIZEOF_LONG)
check_type_size("long long" SIZEOF_LONG_LONG)
check_type_size("float" SIZEOF_FLOAT)
check_type_size("double" SIZEOF_DOUBLE)
# Hard safety nets: every NDK ABI defines these sizes.
if(NOT SIZEOF_SHORT)
    set(SIZEOF_SHORT 2)
endif()
if(NOT SIZEOF_INT)
    set(SIZEOF_INT 4)
endif()
if(NOT SIZEOF_LONG)
    set(SIZEOF_LONG 4)
endif()
if(NOT SIZEOF_LONG_LONG)
    set(SIZEOF_LONG_LONG 8)
endif()
if(NOT SIZEOF_FLOAT)
    set(SIZEOF_FLOAT 4)
endif()
if(NOT SIZEOF_DOUBLE)
    set(SIZEOF_DOUBLE 8)
endif()

configure_file(config.h.in ${CMAKE_CURRENT_BINARY_DIR}/config.h)

# ---- libmp3lame (vendored upstream 3.100, unmodified) ----
set(LAME_SOURCES
    ${LAME_DIR}/libmp3lame/VbrTag.c
    ${LAME_DIR}/libmp3lame/bitstream.c
    ${LAME_DIR}/libmp3lame/encoder.c
    ${LAME_DIR}/libmp3lame/fft.c
    ${LAME_DIR}/libmp3lame/gain_analysis.c
    ${LAME_DIR}/libmp3lame/id3tag.c
    ${LAME_DIR}/libmp3lame/lame.c
    ${LAME_DIR}/libmp3lame/mpglib_interface.c
    ${LAME_DIR}/libmp3lame/newmdct.c
    ${LAME_DIR}/libmp3lame/presets.c
    ${LAME_DIR}/libmp3lame/psymodel.c
    ${LAME_DIR}/libmp3lame/quantize.c
    ${LAME_DIR}/libmp3lame/quantize_pvt.c
    ${LAME_DIR}/libmp3lame/reservoir.c
    ${LAME_DIR}/libmp3lame/set_get.c
    ${LAME_DIR}/libmp3lame/tables.c
    ${LAME_DIR}/libmp3lame/takehiro.c
    ${LAME_DIR}/libmp3lame/util.c
    ${LAME_DIR}/libmp3lame/vbrquantize.c
    ${LAME_DIR}/libmp3lame/version.c
    ${LAME_DIR}/mpglib/common.c
    ${LAME_DIR}/mpglib/dct64_i386.c
    ${LAME_DIR}/mpglib/decode_i386.c
    ${LAME_DIR}/mpglib/interface.c
    ${LAME_DIR}/mpglib/layer1.c
    ${LAME_DIR}/mpglib/layer2.c
    ${LAME_DIR}/mpglib/layer3.c
    ${LAME_DIR}/mpglib/tabinit.c
)

add_library(mp3lame STATIC ${LAME_SOURCES})
target_include_directories(mp3lame
    PUBLIC ${LAME_DIR}/include
    PRIVATE ${CMAKE_CURRENT_BINARY_DIR}
            ${LAME_DIR}/libmp3lame
            ${LAME_DIR}/mpglib
)
target_compile_definitions(mp3lame PRIVATE HAVE_CONFIG_H)
# Vendored third-party code: build it quiet, never let its warnings break
# the app build.
target_compile_options(mp3lame PRIVATE -w)

# ---- the JNI wrapper shipped as libytconvert_mp3.so ----
add_library(ytconvert_mp3 SHARED mp3lame_wrapper.c)
target_include_directories(ytconvert_mp3 PRIVATE ${LAME_DIR}/include)
target_link_libraries(ytconvert_mp3 PRIVATE mp3lame)
