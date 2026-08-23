// electron-builder afterAllArtifactBuild 훅.
// 생성된 설치 파일(NSIS .exe / dmg / AppImage / deb) 중 하나를 프로젝트 루트로 복사한다.
const fs = require('node:fs')
const path = require('node:path')

/** 설치 파일로 볼 확장자 우선순위. */
const INSTALLER_EXTS = ['.exe', '.dmg', '.appimage', '.deb']

module.exports = async function afterAllArtifactBuild(buildResult) {
  const artifacts = buildResult.artifactPaths || []
  // 블록맵/업데이트 메타는 제외하고 실제 설치 파일만 선택
  const installer = artifacts.find((p) => {
    const lower = p.toLowerCase()
    if (lower.endsWith('.blockmap') || lower.endsWith('.yml') || lower.endsWith('.yaml')) return false
    return INSTALLER_EXTS.some((ext) => lower.endsWith(ext))
  })

  if (!installer) {
    console.log('[afterBuild] 복사할 설치 파일을 찾지 못했습니다.')
    return
  }

  const dest = path.join(__dirname, '..', path.basename(installer))
  fs.copyFileSync(installer, dest)
  console.log(`[afterBuild] 설치 파일을 루트로 복사했습니다 → ${dest}`)
  return [dest]
}
