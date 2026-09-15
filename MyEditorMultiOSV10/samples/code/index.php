<?php
// PHP — classes, arrays, string interpolation
declare(strict_types=1);

final class Greeter
{
    public function __construct(private string $name = 'world') {}

    public function greet(): string
    {
        return "Hello, {$this->name}!";
    }
}

$people = ['Kim' => 34, 'Lee' => 27];
foreach ($people as $name => $age) {
    echo (new Greeter($name))->greet(), " ($age)\n";
}
