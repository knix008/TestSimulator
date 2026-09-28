// MyCAD sample: the subset of OpenSCAD the importer understands.
// A base plate with a boss and a post, with two bores taken back out.
difference(){
  union(){
    cube([80,50,10]);
    translate([10,10,10]) cylinder(h=24, r=12);
    translate([55,15,10]) cube([20,20,30]);
    translate([65,25,40]) sphere(9);
  }
  translate([10,10,0]) cylinder(h=40, r=6);
  translate([65,25,0]) cylinder(h=20, r=5);
}
