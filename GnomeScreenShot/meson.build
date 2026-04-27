project('enhanced-screenshot', 'c',
  version: '1.0.0',
  meson_version: '>= 0.59.0',
  default_options: ['warning_level=2', 'c_std=gnu11']
)

# Dependencies
gtk_dep = dependency('gtk+-3.0', version: '>= 3.22')
cairo_dep = dependency('cairo')
x11_dep = dependency('x11')

# Source files
sources = files(
  'src/main.c',
  'src/screenshot.c',
  'src/autosave.c',
  'src/editor.c',
  'src/utils.c'
)

# Executable
executable('enhanced-screenshot',
  sources,
  dependencies: [gtk_dep, cairo_dep, x11_dep],
  install: true
)
