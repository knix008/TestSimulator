-- Lua — tables, metatables, closures
local Vector = {}
Vector.__index = Vector

function Vector.new(x, y) return setmetatable({ x = x, y = y }, Vector) end
function Vector.__add(a, b) return Vector.new(a.x + b.x, a.y + b.y) end
function Vector:length() return math.sqrt(self.x ^ 2 + self.y ^ 2) end

local function counter()
  local n = 0
  return function() n = n + 1; return n end
end

local v = Vector.new(3, 4) + Vector.new(1, 1)
local next = counter()
print(v:length(), next(), next())
