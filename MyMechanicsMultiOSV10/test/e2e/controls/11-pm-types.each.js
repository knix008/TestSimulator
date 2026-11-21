//@step {"name": "pm: __TYPE__ numbers — every number field's −, + and a typed value change the feature and rebuild its preview", "expect": "^__TYPE__ ok"}
window.__pmCheck('__TYPE__', 'num')
//@step {"name": "pm: __TYPE__ options — every toggle, segment, drop-down and pick box changes the feature; OK stores the values", "expect": "^__TYPE__ ok"}
window.__pmCheck('__TYPE__', 'opts')
