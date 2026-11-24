//@generate commands
//@step {"name": "cmd: part · editFeature with a feature selected — works on it", "expect": "^ok"}
window.__cmdOne('part', 'editFeature', { select: 'feature' })
//@step {"name": "cmd: part · suppress with a feature selected — works on it", "expect": "^ok"}
window.__cmdOne('part', 'suppress', { select: 'feature' })
//@step {"name": "cmd: part · unsuppress with a feature selected — works on it", "expect": "^ok"}
return (async () => { await window.__cmdContext('part'); window.__CMD_PRE.unsuppress = () => window.__mymechanics.run('suppress'); try { return await window.__cmdOne('part', 'unsuppress', { select: 'feature' }); } finally { delete window.__CMD_PRE.unsuppress; } })()
//@step {"name": "cmd: part · rollbackHere with a feature selected — works on it", "expect": "^ok"}
window.__cmdOne('part', 'rollbackHere', { select: 'feature' })
//@step {"name": "cmd: part · rename with a feature selected — works on it", "expect": "^ok"}
window.__cmdOne('part', 'rename', { select: 'feature' })
//@step {"name": "cmd: part · delete with a feature selected — works on it", "expect": "^ok"}
window.__cmdOne('part', 'delete', { select: 'feature' })
//@step {"name": "cmd: part · clearSelection with a feature selected — works on it", "expect": "^ok"}
window.__cmdOne('part', 'clearSelection', { select: 'feature' })
//@step {"name": "cmd: assembly · fixComponent with a component selected — works on it", "expect": "^ok"}
window.__cmdOne('assembly', 'fixComponent', { select: 'component' })
//@step {"name": "cmd: assembly · floatComponent with a component selected — works on it", "expect": "^ok"}
return (async () => { await window.__cmdContext('assembly'); window.__CMD_PRE.floatComponent = () => window.__mymechanics.run('fixComponent'); try { return await window.__cmdOne('assembly', 'floatComponent', { select: 'component' }); } finally { delete window.__CMD_PRE.floatComponent; } })()
//@step {"name": "cmd: assembly · rotateComponent with a component selected — works on it", "expect": "^ok"}
window.__cmdOne('assembly', 'rotateComponent', { select: 'component' })
//@step {"name": "cmd: assembly · rotateComponentX with a component selected — works on it", "expect": "^ok"}
window.__cmdOne('assembly', 'rotateComponentX', { select: 'component' })
//@step {"name": "cmd: assembly · rotateComponentY with a component selected — works on it", "expect": "^ok"}
window.__cmdOne('assembly', 'rotateComponentY', { select: 'component' })
//@step {"name": "cmd: assembly · openPart with a component selected — works on it", "expect": "^ok"}
window.__cmdOne('assembly', 'openPart', { select: 'component' })
//@step {"name": "cmd: assembly · delete with a component selected — works on it", "expect": "^ok"}
window.__cmdOne('assembly', 'delete', { select: 'component' })
//@step {"name": "cmd: assembly · rename with a component selected — works on it", "expect": "^ok"}
window.__cmdOne('assembly', 'rename', { select: 'component' })
//@step {"name": "cmd: assembly · clearSelection with a component selected — works on it", "expect": "^ok"}
window.__cmdOne('assembly', 'clearSelection', { select: 'component' })
