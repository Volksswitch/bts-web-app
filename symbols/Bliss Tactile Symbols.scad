// Bliss Tactile Symbols — combined designer + graphic maker (web app edition)
//
// Derived from two public-domain Volksswitch OpenSCAD programs:
//   "Bliss Tactile Symbols.scad"  (the symbol designer)
//   "Bliss Graphic STL maker.scad" (the SVG -> raised-graphic STL converter)
// merged into ONE file so a prepped Blissymbol SVG can be turned into a
// finished, 3D-printable tactile symbol in a single render — no intermediate
// STL bake, and no manual type1/type2 scale choice (see raw_graphic()).
//
// Written by Volksswitch <www.volksswitch.org> — released to the public domain
// (CC0). This software is distributed without any warranty.
//
// To the extent possible under law, the author(s) have dedicated all copyright
// and related and neighboring rights to this software to the public domain
// worldwide. See <http://creativecommons.org/publicdomain/zero/1.0/>.


/*[Symbol Info]*/
//determines overall tactile symbol width
Bliss_concept_width = "1"; //[1,1.25,1.5,1.75,2,2.25,2.5,2.75,3,3.25,3.5,3.75,4]
// app-managed override for Bliss_concept_width: the web app measures the
// prepped SVG's ink width and sets the smallest width (in units of the default
// width) whose body holds the graphic with a >=3 mm border each side, so the
// user never picks a width by hand. 0 = use the Bliss_concept_width dropdown above
// (the standalone-OpenSCAD path). Not shown in the app's form.
concept_width_override = 0; // [0:0.25:20]
Bliss_concept_type = "⁀ *noun/pronoun/preposition/other*"; //[⁀ *noun/pronoun/preposition/other*, ^ *verb*, v *adjective/adverb/determiner*, ‾ *phrase*]
//measured in millimeters
symbol_thickness = 10; // [1:40]
//percent of starting size
resize_symbol_height_width = 100; // [50:500]
symbol_display_color = 0; //[0:black-determiner, 1:white-conjunction, 2:red-exclamation, 3:yellow-pronoun, 4:blue-adjective, 5:green-verb, 6:orange-noun, 7:brown-adverb, 8:pink-preposition, 9:purple-question]
//symbol must be at least 6 mm thick to embed a tag
embed_RFID_tag = "yes"; // [yes,no]
//cannot be used with a hole through the symbol
embed_magnets = "no"; // [yes,no]
add_velcro_mounts = "yes"; // [yes,no]
add_center_velcro_mount = "yes"; // [yes,no]
center_velcro_size = 2; // [1:10 mm dot, 2:15 mm dot, 3:5/8 in dot, 4:7/8 in square]
slide_center_velcro_vertically = 10; // [-50:50]

/*[Graphic Info]*/
// The web app renders a text box + "Open"/"Change" button here; Open lists the
// "SVG files" folder and the picked file's base name lands in the box. Standalone
// OpenSCAD reads it too: svg_path below resolves the name against "SVG files/".
// SVG file name for the graphic (no .svg) — pick with Open, or type a name
graphic_svg = "";
// Removes the Bliss indicator glyph (tense/plural/etc.) the graphic was DRAWN
// with, before building it. An indicator added in the web app's "Create a
// graphic" dialog is stamped and is never removed here — that one was chosen
// deliberately, and that dialog carries its own control for the built-in ones.
// Handled by the web app's Step-0 prep; a standalone-OpenSCAD user prepping their
// own SVG can leave this off. As elsewhere in this block, the LAST comment line is
// what the Customizer shows as the field's description — keep it a whole sentence.
// remove the indicator the graphic was drawn with; one you added stays
remove_Bliss_indicators = "yes"; // [yes,no]
// path to the prepped Blissymbol SVG. The web app overrides this (it writes the
// chosen file to graphic.svg in the WASM FS and passes -D svg_path); for a
// standalone OpenSCAD run it resolves graphic_svg against the "SVG files" folder.
svg_path = (graphic_svg == "") ? "graphic.svg" : str("SVG files/", graphic_svg, ".svg");
// millimeters per SVG user unit, as OpenSCAD's importer resolves them. The
// importer maps the viewBox across the physical width/height when those carry
// real units (mm/in), and falls back to 72 dpi when they are unitless or
// absent — so a raw BSI export (324 units over height="4.5in") comes in at
// 25.4/72 = 0.35278, i.e. one user unit is exactly one point. The web app
// rewrites width/height in mm during Step-0 prep, which makes this exactly 1.
svg_mm_per_unit = 1; // [0.01:0.00001:10]
// vertical registration offset, in SVG user units: the signed distance from the
// imported content's bounding-box centre UP to the guideline-band centre
// (y=162 on the 324 matrix). import(center=true) anchors on the content bbox,
// not the viewBox, so without this a symbol whose ink sits mostly below the
// earth line is centred on its ink and its guidelines miss the engraved ones.
// The web app measures this from the prepped SVG; 0 means "already centred".
graphic_registration_offset = 0; // [-500:0.0001:500]
//height of the raised graphic above the symbol face, in millimeters
graphic_height = 2; // [1:5]
graphic_display_color = 1; //[0:black, 1:white]
include_earth_and_sky_lines = "yes"; // [yes,no]

/*[Symbol Text and Braille]*/
symbol_text = "";
engrave_text = "yes"; // [yes,no]
text_location = "sides"; // [front, back, sides, end]
font_style = "regular"; //[regular,bold]
text_height = 6; // [3:50]
rotate_text = 0; // [-180:180]
slide_text_horizontally = 0; // [-50:50]
slide_text_vertically = 0; // [-150:150]
//the symbol must be at least 8 mm thick
include_braille = "no"; //[yes,no]
//if Braille is placed on the front or back, the symbol should be printed on its side
braille_location = "sides"; // [front, back, sides, end]
braille_size_multiplier = 10; //[1:30]
slide_braille_horizontally = 0; // [-50:50]
slide_braille_vertically = 0; // [-50:50]

/*[Hole for String]*/
//cannot be used with magnets
add_hole_for_string = "yes"; // [yes,no]
direction_of_hole = "side to side"; // [side to side, front to back]
location_of_hole = "top of symbol"; // [top of symbol, bottom of symbol]
diameter_of_hole = 5; //[2:0.1:10]
move_hole_vertically = 0; //[-15:0.1:15]

/*[Hidden]*/
// Version of this .scad; the web app compares a user's local copy against the
// published manifest to offer updates. Released via "bump bts" (see RELEASING.md).
// Pre-bump convention: this dev copy reads ONE AHEAD of the last public release
// (published = 1); the pre-bump stays local/unpushed until its release, and on
// GitHub main this must equal the manifest's version.
scad_version = 4;
// Which part(s) to emit. The web app renders "symbol" and "graphic" separately
// so it can display each in its own Customizer colour (STL carries no colour).
// "all" (default) renders the whole symbol together, e.g. for standalone use.
render_part = "all"; // [all, symbol, graphic]
$fn=20;
fudge = 0.0005;
preferred_texture_width = 5;
sc = 2; //symbol chamfer size
sd = symbol_thickness; //symbol depth

// --- Graphic scale: fit the SVG's guideline band to the symbol's ---
// The scale is set by GEOMETRY, not by stroke width: the sky-line-to-earth-line
// band of the Bliss guideline matrix is mapped onto the same band engraved on
// the tactile symbol, and the aspect ratio is preserved from there. The symbol
// body is then made wide enough to hold whatever width that yields.
//
// On the canonical 324-unit matrix the sky line sits at y=130 and the earth
// line — the deeper (lower) of the symbol's two engraved lines — at y=258, so
// the band is 128 units. (The guideline at y=194 is an intermediate line, not
// the earth line; symbols like "acquiring" merely happen to rest a bowl there.)
// earth_sky_half_span sets the physical half-spacing used by earth_sky_lines(),
// so the two cannot drift apart.
//
// (The previous rule scaled by stroke width — target_stroke_mm/svg_stroke_width
// — which left the band at ~3.7 mm instead of 24 mm and made the symbol's size
// depend on how thickly it happened to be drawn. Stroke width now governs only
// the printed line thickness, which is what Step-0's 7->11 fattening sets.)
earth_sky_half_span = 12;                       // engraved lines at y = +/-12
bliss_band_units = 128;                         // sky line 130 -> earth line 258
band_scale_factor = (2*earth_sky_half_span / bliss_band_units) / svg_mm_per_unit;
graphic_scale_factor = band_scale_factor;
// STL-maker's internal raised-graphic height (renamed to avoid colliding with
// the designer's graphic_height protrusion parameter above). 5 + the two 0.1
// chamfer steps + the 1 mm base lift = the 6.2 total that the placement math in
// graphic() depends on; don't change one without the other.
raw_graphic_height = 5;
// Top-edge chamfer: two steps, each chamfer_step mm IN and chamfer_step mm UP,
// i.e. a 45-degree bevel. Applied as a PHYSICAL (mm) offset on the already-
// scaled graphic, so the bevel is a fixed fine size regardless of the graphic's
// size scale. (The old code offset in SVG units inside the scale, so the step
// width came out as delta*graphic_scale_factor — e.g. 3*0.1875 = 0.56 mm — which
// ballooned the bevel; likewise offset(delta=2) fattened the arms. See the
// two-step chamfer in raw_graphic below.)
chamfer_step = 0.1;
// 45-degree chamfer around each opening of the string hole, so the string does
// not chafe on a sharp printed edge and the mouth is easier to thread. Measured
// as the depth of the countersink; the opening comes out hole_chamfer wider all
// round, i.e. diameter_of_hole + 2*hole_chamfer at the surface.
hole_chamfer = 0.5;
// How far the countersink cones carry on PAST the face they break out of. The
// cut still measures hole_chamfer at the surface — the overrun only keeps the
// cutting solid from ending flush with the body, which would leave coplanar
// faces for the difference() to resolve.
hole_chamfer_overrun = 0.5;

have_graphic = (svg_path != "");

symbol_colors = [[0,"DimGray"],[1,"Snow"],[2,"Red"],[3,"Yellow"],[4,"RoyalBlue"],[5,"Lime"],[6,"DarkOrange"],[7,"SaddleBrown"],[8,"Pink"],[9,"DarkViolet"]];
symbol_color = symbol_colors[symbol_display_color][1];

graphic_colors = [[0,"DimGray"],[1,"Snow"]];
graphic_color = graphic_colors[graphic_display_color][1];

rm = resize_symbol_height_width/100; //resize multiplier

//braille
bsm = braille_size_multiplier/10; //Braille size multiplier

braille_a = " abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
braille_d = [0,32,40,48,52,36,56,60,44,24,28,34,42,50,54,38,58,62,46,26,30,35,43,29,51,55,39,32,40,48,52,36,56,60,44,24,28,34,42,50,54,38,58,62,46,26,30,35,43,29,51,55,39];
binary_text = search(symbol_text,braille_a);

//Bliss variables
bcw = (concept_width_override > 0) ? concept_width_override :
		(Bliss_concept_width=="1") ? 1 :
		(Bliss_concept_width=="1.25") ? 1.25 :
		(Bliss_concept_width=="1.5") ? 1.5 :
		(Bliss_concept_width=="1.75") ? 1.75 :
		(Bliss_concept_width=="2") ? 2 :
		(Bliss_concept_width=="2.25") ? 2.25 :
		(Bliss_concept_width=="2.5") ? 2.5 :
		(Bliss_concept_width=="2.75") ? 2.75 :
		(Bliss_concept_width=="3") ? 3 :
		(Bliss_concept_width=="3.25") ? 3.25 :
		(Bliss_concept_width=="3.5") ? 3.5 :
		(Bliss_concept_width=="3.75") ? 3.75 :
		(Bliss_concept_width=="4") ? 4 : 1;

bsw = bcw*36*rm; //blissymbol width
bst = 36*rm; //blissymbol top
bsb = -30*rm; //blissymbol bottom


//*********** Main *****************

difference(){
	union(){
		scale([rm,rm,1])
		union(){
			if(render_part != "graphic"){
				color(symbol_color)
				difference(){
					base_bliss_symbol();

					//engrave skyline and earthline
					if(include_earth_and_sky_lines=="yes"){
						earth_sky_lines();
					}
				}
			}

			//graphic
			if(render_part != "symbol"){
				color(graphic_color)
				graphic();
			}

		}

		//braille
		if(render_part != "graphic" && include_braille=="yes" && symbol_text!=""){
			color(symbol_color)
			add_braille();
		}
	}

	//symbol_text
	if(engrave_text=="yes" && symbol_text!=""){
		engraved_text();
	}

	//hole
	if(add_hole_for_string=="yes"){
		add_hole();
	}

	//RFID tag
	if(embed_RFID_tag=="yes" && sd >= 4){
		add_RFID_slot();
	}

	//slot for magnet
	if(embed_magnets=="yes" && sd >= 6 && add_hole_for_string=="no"){
		add_magnet_slots();
	}

	//velcro recesses
	if (add_velcro_mounts=="yes"){
		if (add_center_velcro_mount=="no"){
			velcro_mounts();
		}
		else{
			center_velcro_mount();
		}
	}
}


//************* Modules *******************


// graphic — inlined from the former two-step flow.
// Previously the "Bliss Graphic STL maker" baked the SVG into an STL and this
// module did import(file=...stl, center=true). We now build that same geometry
// on the fly (raw_graphic()) and apply the identical mask + placement, so the
// result is geometrically the same as importing the pre-baked STL — but from an
// SVG directly. (import(center=true) was a no-op in Z for the centered graphic:
// the STL spanned Z 0..6.2 and this translate puts its top at sd/2+graphic_height.)
module graphic(){
	if (have_graphic){
		mask_height = 6-sd-.5;

		// Registration is derived from the SVG's own guidelines, so there is no
		// manual vertical nudge — the offset is in SVG units and scales with the
		// graphic. (This replaced slide_Bliss_graphic_vertically, which existed
		// only to correct the misplacement this now computes.)
		translate([0,
		           graphic_registration_offset*graphic_scale_factor,
		           sd/2-6.2+graphic_height])
		difference(){
			raw_graphic();

			translate([0,0,mask_height/2-fudge])
			cube([bsw*2,(bst-bsb)*2,mask_height],center=true);
		}
	}
}

// raw_graphic — the former "Bliss Graphic STL maker" output, built in place.
// Produces a graphic spanning Z 0..6.2 with X/Y centered on the SVG.
//
// The graphic is SCALED IN 2D (graphic_scale_factor) so the offsets below can be
// applied in physical mm rather than SVG units. The body has vertical walls at
// the graphic's true arm width — the prepped SVG is already a filled stroke
// outline, so no growth offset is added (the old offset(delta=2) fattened every
// arm by 2*gsf per side, ~0.75 mm at this scale). The top edge then gets a
// two-step 45-degree chamfer, each step a fixed chamfer_step mm in and up.
module graphic_2d(){
	scale([graphic_scale_factor, graphic_scale_factor])
	import(file = svg_path, center = true);
}

module raw_graphic(){
	translate([0,0,1])
	union(){
		// Vertical body up to z = raw_graphic_height, at the true arm width.
		translate([0,0,-1])
		linear_extrude(height=raw_graphic_height+1)
		graphic_2d();

		// Two-step top chamfer: each slice sits chamfer_step higher and is inset
		// chamfer_step mm, giving a 45-degree bevel of a fixed physical size. Top
		// stays at raw_graphic_height + 2*chamfer_step = 5.2, so Z span is 0..6.2.
		for (i = [1:2])
			translate([0,0, raw_graphic_height + (i-1)*chamfer_step])
			linear_extrude(height=chamfer_step)
			offset(delta = -i*chamfer_step)
			graphic_2d();
	}
}

module engraved_text(){
	if(text_location == "back"){
		translate([-slide_text_horizontally,slide_text_vertically,-sd/2+1-fudge])
		rotate([0,0,rotate_text])
		rotate([0,180,0])
		get_text();
	}
	else if(text_location == "front"){
		translate([slide_text_horizontally,slide_text_vertically,sd/2-1+fudge])
		get_text();
	}
	else if(text_location == "sides"){
		translate([bsw/2-1+fudge,slide_text_horizontally,0])
		rotate([0,0,90])
		rotate([90,0,0])
		get_text();

		translate([-bsw/2+1-fudge,slide_text_horizontally,0])
		rotate([0,0,-90])
		rotate([90,0,0])
		get_text();
	}
	else{ // end
		adj = 1-rm;
		translate([slide_text_horizontally,bsb+adj-fudge,0])
		rotate([90,0,0])
		get_text();
	}
}

module get_text(){
	fs = (font_style=="regular") ? "Liberation Sans:style=Regular" : "Liberation Sans:style=Bold";

	linear_extrude(height=1)
	text(str(symbol_text),font=fs,size=text_height,valign="center",halign="center");
}

//braille
module add_braille(){
	bliss_braille();
}

module bliss_braille(){
	if(braille_location=="sides"){
		translate([-bsw/2,slide_braille_horizontally,0])
		rotate([0,0,-90])
		rotate([90,0,0])
		braille_word_flat();

		translate([bsw/2,slide_braille_horizontally,0])
		rotate([0,0,90])
		rotate([90,0,0])
		braille_word_flat();
	}
	else if(braille_location=="front"){
		translate([slide_braille_horizontally,slide_braille_vertically,sd/2])
		braille_word_flat();
	}
	else if(braille_location=="back"){
		translate([-slide_braille_horizontally,slide_braille_vertically,-sd/2])
		rotate([0,180,0])
		braille_word_flat();
	}
	else{ //end
		adj = 1-rm;
		translate([slide_text_horizontally,bsb+adj-fudge-1,0])
		rotate([90,0,0])
		braille_word_flat();
	}
}

module braille_word_flat(){
	translate([(-6.1*(len(binary_text)-1)/2)*bsm,0,0])
	for(i=[0:len(binary_text)-1]){
	   translate([6.1*i*bsm,0,0])
	   braille_by_row(braille_d[binary_text[i]]);
	}
}
module braille_by_row(decimal){
	b1 = decimal%2;
	b1a = floor(decimal/2);
	b2 = b1a%2;
	b2a = floor(b1a/2);
	b3 = b2a%2;
	b3a = floor(b2a/2);
	b4 = b3a%2;
	b4a = floor(b3a/2);
	b5 = b4a%2;
	b5a = floor(b4a/2);
	b6 = b5a%2;
	b=[b6,b5,b4,b3,b2,b1];

	dots_letter(b);
}

module dots_letter(b){
	$fn=20;

	if (b[0]==1){
		translate([-1.25*bsm,2.5*bsm,0])
		sphere(d=1.5*bsm);
	}
	if (b[1]==1){
		translate([1.25*bsm,2.5*bsm,0])
		sphere(d=1.5*bsm);
	}
	if (b[2]==1){
		translate([-1.25*bsm,0,0])
		sphere(d=1.5*bsm);
	}
	if (b[3]==1){
		translate([1.25*bsm,0,0])
		sphere(d=1.5*bsm);
	}
	if (b[4]==1){
		translate([-1.25*bsm,-2.5*bsm,0])
		sphere(d=1.5*bsm);
	}
	if (b[5]==1){
		translate([1.25*bsm,-2.5*bsm,0])
		sphere(d=1.5*bsm);
	}
}

module earth_sky_lines(){
	line_width = 36*bcw+4;

	translate([0,earth_sky_half_span,sd/2+fudge])
	rotate([0,90,0])
	translate([0,0,-line_width/2])
	linear_extrude(height=line_width)
	polygon([[0,-.25],[.5,0],[0,.25]]);


	translate([0,-earth_sky_half_span,sd/2+fudge])
	rotate([0,90,0])
	translate([0,0,-line_width/2])
	linear_extrude(height=line_width)
	polygon([[0,-.5],[.5,0],[0,.5]]);
}

module base_bliss_symbol(){
	translate([0,0,-(symbol_thickness-sc)/2])
	linear_extrude(height=symbol_thickness-sc)
	shape();

	shape_chamfer();

	mirror([0,0,1])
	shape_chamfer();
}

module shape(){
	delt = sc;
	offset(delta=delt,chamfer=true)
	union(){
		peak = (Bliss_concept_type=="⁀ *noun/pronoun/preposition/other*" || Bliss_concept_type=="‾ *phrase*") ? 35 :
				(Bliss_concept_type=="^ *verb*") ? 41 :
				30;

		x1 = -(18*bcw-delt);
		x2 = 18*bcw-delt;
		x3 = 18*bcw-delt;
		x4 = 0;
		x5 = -(18*bcw-delt);

		y1 = -29;
		y2 = -29;
		y3 = 35;
		y4 = peak;
		y5 = 35;

		polygon([[x1,y1],[x2,y2],[x3,y3],[x4,y4],[x5,y5]]);

		if(Bliss_concept_type=="⁀ *noun/pronoun/preposition/other*"){
			$fn=60;
			top_len = (bcw == 1) ? 32 :
					  (bcw == 1.25) ? 32.9 :
					  (bcw == 1.5) ? 33.5 :
					  (bcw == 1.75) ? 33.9 :
					  (bcw == 2) ? 34.2 :
					  (bcw == 2.25) ? 34.35 :
					  (bcw == 2.5) ? 35 :
					  (bcw == 2.75) ? 35.1 :
					  (bcw == 3) ? 35 :
					  34.8;

			d1 = 6;
			// d2 = (34)/2*(bcw);
			d2 = top_len/2*(bcw);
			Cx = (d2*d2)/(2*d1) - d1/2;
			radius = Cx + d1;

			translate([0,35-fudge])
			rotate([0,0,90])
			difference(){
				translate([-Cx,0])
				circle(r=radius);

				translate([-radius*2-10,-radius-5-fudge])
				square([radius*2+10,radius*2+10]);

			}
		}
	}
}

module shape_chamfer(){
	translate([0,0,symbol_thickness/2])
	for(i=[1:sc*5]){
		translate([0,0,-i*0.1])
		linear_extrude(height=0.1)
		offset(delta=-sc/2,chamfer=true)
		offset(delta=0.1*i)
		shape();
	}
}


module add_hole(){

	doh = (direction_of_hole=="side to side") ? min(diameter_of_hole,symbol_thickness-4) : diameter_of_hole;

	rotation = (direction_of_hole=="side to side") ? 90 : 0;
	hole_len = (direction_of_hole=="side to side") ? bsw+20 :symbol_thickness+20;
	hole_location = (location_of_hole=="top of symbol") ? bst-doh/2-2*rm : bsb+doh/2+2;

	// Half-distance from the hole's axis to the face it breaks out of, so the
	// countersinks land ON the surface rather than at the ends of the oversized
	// drill. Side to side, the body's side walls are vertical at x = +/-bsw/2
	// (shape() insets the polygon by sc then offsets it back out); front to back,
	// the faces are the flat top and bottom at z = +/-symbol_thickness/2.
	half_span = (direction_of_hole=="side to side") ? bsw/2 : symbol_thickness/2;

	translate([0,hole_location+move_hole_vertically-5,0])
	rotate([0,rotation,0]){
		cylinder(d=doh,h=hole_len,center=true);

		// Chamfer both mouths: a single 45-degree cone per end, running from
		// hole_chamfer below the face to hole_chamfer_overrun clear of it. Keeping
		// the same slope the whole way means the cut is still exactly hole_chamfer
		// wide where it crosses the surface, while no face of the cutting solid
		// ever lands ON that surface — coplanar faces make CGAL's difference
		// ambiguous and show up as ghosting/z-fighting in the OpenSCAD preview.
		for(s=[1,-1]) scale([1,1,s])
			translate([0,0,half_span-hole_chamfer])
			cylinder(d1 = doh,
					 d2 = doh+2*(hole_chamfer+hole_chamfer_overrun),
					 h  = hole_chamfer+hole_chamfer_overrun);
	}
}

module add_RFID_slot(){
	translate([0,0,-symbol_thickness/2+4])
	cylinder(d=30,h=1);
}

module add_magnet_slots(){
	translate([0,25,-symbol_thickness/2+3.5])
	cube([20,5.5,3],center=true);

	translate([0,-25,-symbol_thickness/2+3.5])
	cube([20,5.5,3],center=true);
}

module velcro_mounts(){
	//bottom right
	translate([(-bsw/2+8),-30*rm+10,-symbol_thickness/2-fudge])
	cylinder(d=11, h=1, $fn=50);

	//bottom left
	translate([bsw/2-8,-30*rm+10,-symbol_thickness/2-fudge])
	cylinder(d=11, h=1, $fn=50);

	//top left
	translate([bsw/2-8,32*rm-7,-symbol_thickness/2-fudge])
	cylinder(d=11, h=1, $fn=50);

	//top right
	translate([-bsw/2+8,32*rm-7,-symbol_thickness/2-fudge])
	cylinder(d=11, h=1, $fn=50);
}

module center_velcro_mount(){
	translate([0,slide_center_velcro_vertically*rm,-symbol_thickness/2-fudge])
	if(center_velcro_size==1){ // 10 mm dot
		cylinder(d=11, h=1, $fn=50);
	}
	else if(center_velcro_size==2 || center_velcro_size==3){ // 15 mm dot or 5/8 inch dot
		cylinder(d=16, h=1, $fn=50);
	}
	else{ // 7/8 inch rectangle
		cube([22,22,2.5],center=true);
	}
}
