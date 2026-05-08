project('enhanced-screenshot', 'c',
  version: '1.0.0',
  meson_version: '>= 0.59.0',
  default_options: ['warning_level=2', 'c_std=gnu11']
)

# Core GTK3 stack
gtk_dep      = dependency('gtk+-3.0',    version: '>= 3.22')
cairo_dep    = dependency('cairo')
gio_dep      = dependency('gio-2.0')

# X11 extensions used by gnome-screenshot
x11_dep      = dependency('x11')
xfixes_dep   = dependency('xfixes')       # XFixesGetCursorImage for pointer capture
xcomposite_dep = dependency('xcomposite') # window compositing support

# GDK X11 backend
gdk_x11_dep  = dependency('gdk-x11-3.0')

# Math library (needed by editor.c for cos/sin/atan2)
m_dep = meson.get_compiler('c').find_library('m', required: true)

sources = files(
  'src/main.c',
  'src/screenshot.c',
  'src/screenshot-area-selection.c',
  'src/autosave.c',
  'src/editor.c',
  'src/utils.c'
)

executable('screenshot',
  sources,
  dependencies: [
    gtk_dep,
    cairo_dep,
    gio_dep,
    x11_dep,
    xfixes_dep,
    xcomposite_dep,
    gdk_x11_dep,
    m_dep,
  ],
  install: true
)
