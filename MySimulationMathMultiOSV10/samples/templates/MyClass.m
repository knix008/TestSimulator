classdef MyClass
    %MYCLASS Short description.

    properties
        Value = 0
    end

    methods
        function obj = MyClass(v)
            if nargin > 0
                obj.Value = v;
            end
        end

        function r = twice(obj)
            r = 2 * obj.Value;
        end
    end
end
