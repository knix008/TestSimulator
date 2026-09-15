# Ruby — classes, blocks, string interpolation
class Stack
  def initialize = @items = []
  def push(x) = @items.push(x) && self
  def pop = @items.pop
  def each(&block) = @items.reverse.each(&block)
end

s = Stack.new.push(1).push(2).push(3)
s.each { |x| puts "item #{x}" }
puts "popped #{s.pop}"
