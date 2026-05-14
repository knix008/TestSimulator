#pragma once
#include "tts_engine.h"

/* Sherpa-ONNX VITS TTS engine.
   Loads models from ~/.local/share/sherpa-onnx/<model-dir>/.
   Each subdirectory containing a .onnx file and tokens.txt is a valid model. */
TTSEngine *tts_sherpa_new(void);
