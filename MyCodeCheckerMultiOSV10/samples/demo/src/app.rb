def show(name)
  eval(name)
  system("echo #{name}")
  "<b>#{name}</b>".html_safe
end
