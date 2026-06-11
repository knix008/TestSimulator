project('myclock-gtk', 'c',
  version : '1.0.0',
  license : 'MIT',
  default_options : ['warning_level=1', 'c_std=c17']
)

cc = meson.get_compiler('c')

gtk4_dep = dependency('gtk4')
json_dep = dependency('json-glib-1.0')
m_dep    = cc.find_library('m', required : false)

sources = files(
  'src/main.c',
  'src/main_window.c',
  'src/side_panel.c',
  'src/widgets/analog_clock.c',
  'src/widgets/seven_segment.c',
  'src/widgets/dot_matrix.c',
  'src/widgets/world_time_panel.c',
  'src/models/settings.c',
  'src/models/city_database.c',
  'src/services/timer_service.c',
  'src/services/stopwatch_service.c',
  'src/dialogs/add_alarm_dialog.c',
  'src/dialogs/add_world_time_dialog.c',
  'src/dialogs/alarm_notification.c',
)

executable('myclock',
  sources,
  dependencies : [gtk4_dep, json_dep, m_dep],
  include_directories : include_directories('src'),
  install : true,
)

# Install data files
install_data('data/myclock.css',
  install_dir : get_option('datadir') / 'myclock'
)

theme_css = [
  'data/themes/dark.css',
  'data/themes/light.css',
  'data/themes/midnight.css',
  'data/themes/ocean.css',
  'data/themes/ruby.css',
  'data/themes/emerald.css',
  'data/themes/purple.css',
  'data/themes/amber.css',
  'data/themes/rose.css',
  'data/themes/mono.css',
  'data/themes/sunset.css',
  'data/themes/mint.css',
]
install_data(theme_css,
  install_dir : get_option('datadir') / 'myclock' / 'themes'
)
