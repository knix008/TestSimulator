#pragma once
#include "tts_engine.h"

/* Create an eSpeak-NG TTS engine instance.
   Call engine->init() before first use.
   Call engine->cleanup() to free all resources. */
TTSEngine *tts_espeak_new(void);
