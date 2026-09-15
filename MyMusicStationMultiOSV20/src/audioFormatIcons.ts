import audioIconGeneric from '../asset/audio-icon.svg'
import audioIconAac from '../asset/audio-icons/aac.svg'
import audioIconAiff from '../asset/audio-icons/aiff.svg'
import audioIconFlac from '../asset/audio-icons/flac.svg'
import audioIconM4a from '../asset/audio-icons/m4a.svg'
import audioIconMp3 from '../asset/audio-icons/mp3.svg'
import audioIconOgg from '../asset/audio-icons/ogg.svg'
import audioIconOpus from '../asset/audio-icons/opus.svg'
import audioIconWav from '../asset/audio-icons/wav.svg'
import audioIconWebm from '../asset/audio-icons/webm.svg'
import audioIconWma from '../asset/audio-icons/wma.svg'

const audioFormatIconByExt: Record<string, string> = {
  '.aac': audioIconAac,
  '.aif': audioIconAiff,
  '.aiff': audioIconAiff,
  '.flac': audioIconFlac,
  '.m4a': audioIconM4a,
  '.mp3': audioIconMp3,
  '.ogg': audioIconOgg,
  '.opus': audioIconOpus,
  '.wav': audioIconWav,
  '.webm': audioIconWebm,
  '.wma': audioIconWma,
}

const extensionOf = (value: string) => {
  const match = value.toLowerCase().match(/\.[^.\\/]+$/)
  return match?.[0]
}

/** File-type artwork when a track has no embedded cover. */
export const audioFormatIconForName = (name: string) => {
  const extension = extensionOf(name)
  return (extension && audioFormatIconByExt[extension]) || audioIconGeneric
}
