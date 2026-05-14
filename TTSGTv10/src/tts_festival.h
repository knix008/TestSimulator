#pragma once
#include "tts_engine.h"

/* Create a Festival TTS engine that drives the `text2wave` CLI tool.
   init() returns false if Festival/text2wave is not installed.
   Call engine->cleanup() to free resources. */
TTSEngine *tts_festival_new(void);
