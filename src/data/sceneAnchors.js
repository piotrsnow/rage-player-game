/**
 * Location templates with named anchor points for 3D scene placement.
 * Each anchor has a position [x, y, z] and a default facing direction.
 * Y=0 is ground level.
 */

export const LOCATION_ANCHORS = {
  tavern: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    bar_counter_center:   { position: [0, 0, -3.5],   facing: 'north' },
    bar_counter_left:     { position: [-1.5, 0, -3.5], facing: 'north' },
    bar_counter_right:    { position: [1.5, 0, -3.5],  facing: 'north' },
    bar_counter_behind:   { position: [0, 0, -4.5],   facing: 'south' },
    table_main_north:     { position: [-2.5, 0, -1],   facing: 'south' },
    table_main_south:     { position: [-2.5, 0, 0.5],  facing: 'north' },
    table_main_east:      { position: [-1.5, 0, -0.25], facing: 'west' },
    table_main_west:      { position: [-3.5, 0, -0.25], facing: 'east' },
    table_main_surface:   { position: [-2.5, 0.75, -0.25], facing: 'south' },
    table_corner:         { position: [3, 0, 2],       facing: 'west' },
    fireplace_front:      { position: [3.5, 0, -2],    facing: 'east' },
    fireplace_side:       { position: [3.5, 0, -1],    facing: 'east' },
    door_main_inside:     { position: [0, 0, 5],       facing: 'north' },
    door_main_outside:    { position: [0, 0, 6],       facing: 'south' },
    stairs_bottom:        { position: [-4, 0, -3],     facing: 'east' },
    window_left:          { position: [-4.5, 0, 1],    facing: 'east' },
    window_right:         { position: [4.5, 0, 1],     facing: 'west' },
    stage_center:         { position: [2, 0.3, 2],     facing: 'south' },
  },

  forest: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    clearing_center:      { position: [0, 0, 0],      facing: 'south' },
    clearing_edge_north:  { position: [0, 0, -5],     facing: 'south' },
    clearing_edge_south:  { position: [0, 0, 5],      facing: 'north' },
    path_start:           { position: [0, 0, 8],      facing: 'north' },
    path_end:             { position: [0, 0, -8],     facing: 'south' },
    tree_large:           { position: [4, 0, -2],     facing: 'west' },
    tree_fallen:          { position: [-3, 0, 3],     facing: 'east' },
    campfire:             { position: [0, 0, 0],      facing: 'south' },
    stream_bank:          { position: [-5, 0, 0],     facing: 'east' },
    rock_large:           { position: [3, 0, 4],      facing: 'west' },
    bush_hiding:          { position: [-4, 0, -3],    facing: 'east' },
    log_sitting:          { position: [1.5, 0, 1.5],  facing: 'south' },
  },

  dungeon: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    corridor_center:      { position: [0, 0, 0],      facing: 'south' },
    corridor_start:       { position: [0, 0, 6],      facing: 'north' },
    corridor_end:         { position: [0, 0, -6],     facing: 'south' },
    door_iron:            { position: [0, 0, -5],     facing: 'south' },
    door_wooden:          { position: [0, 0, 5],      facing: 'north' },
    cell_inside:          { position: [3, 0, 0],      facing: 'west' },
    cell_bars:            { position: [2, 0, 0],      facing: 'east' },
    altar_front:          { position: [0, 0, -3],     facing: 'south' },
    altar_surface:        { position: [0, 1, -4],     facing: 'south' },
    pillar_left:          { position: [-3, 0, -1],    facing: 'east' },
    pillar_right:         { position: [3, 0, -1],     facing: 'west' },
    chest_corner:         { position: [-3, 0, -4],    facing: 'east' },
    torch_wall_left:      { position: [-4, 1.8, 0],   facing: 'east' },
    torch_wall_right:     { position: [4, 1.8, 0],    facing: 'west' },
  },

  road: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    road_center:          { position: [0, 0, 0],      facing: 'south' },
    road_ahead:           { position: [0, 0, -8],     facing: 'south' },
    road_behind:          { position: [0, 0, 8],      facing: 'north' },
    roadside_left:        { position: [-3, 0, 0],     facing: 'east' },
    roadside_right:       { position: [3, 0, 0],      facing: 'west' },
    signpost:             { position: [2, 0, 1],      facing: 'west' },
    cart_stopped:         { position: [-2, 0, 2],     facing: 'south' },
    bridge_start:         { position: [0, 0, 3],      facing: 'north' },
    bridge_middle:        { position: [0, 0, 0],      facing: 'south' },
    ditch_left:           { position: [-4, -0.5, 0],  facing: 'east' },
    milestone:            { position: [2.5, 0, -3],   facing: 'west' },
  },

  castle: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    throne:               { position: [0, 0.5, -5],   facing: 'south' },
    throne_steps:         { position: [0, 0, -3],     facing: 'north' },
    great_hall_center:    { position: [0, 0, 0],      facing: 'south' },
    banner_left:          { position: [-4, 2, -4],    facing: 'east' },
    banner_right:         { position: [4, 2, -4],     facing: 'west' },
    guard_post_left:      { position: [-3, 0, 3],     facing: 'south' },
    guard_post_right:     { position: [3, 0, 3],      facing: 'south' },
    door_main:            { position: [0, 0, 6],      facing: 'north' },
    window_high:          { position: [4.5, 2, 0],    facing: 'west' },
    table_feast:          { position: [-2, 0, 1],     facing: 'south' },
    table_feast_surface:  { position: [-2, 0.8, 1],   facing: 'south' },
    fireplace_grand:      { position: [5, 0, -2],     facing: 'west' },
    pillar_left:          { position: [-3, 0, -1],    facing: 'east' },
    pillar_right:         { position: [3, 0, -1],     facing: 'west' },
  },

  market: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    square_center:        { position: [0, 0, 0],      facing: 'south' },
    stall_left:           { position: [-4, 0, -1],    facing: 'east' },
    stall_right:          { position: [4, 0, -1],     facing: 'west' },
    stall_center:         { position: [0, 0, -3],     facing: 'south' },
    stall_behind:         { position: [0, 0, -4],     facing: 'south' },
    fountain:             { position: [0, 0, 2],      facing: 'south' },
    cart_vendor:          { position: [-3, 0, 3],     facing: 'south' },
    crowd_edge:           { position: [2, 0, 4],      facing: 'north' },
    alley_entrance:       { position: [-5, 0, 0],     facing: 'east' },
    notice_board:         { position: [3, 1, -3],     facing: 'west' },
    well:                 { position: [2, 0, 0],      facing: 'west' },
  },

  camp: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    campfire_center:      { position: [0, 0, 0],      facing: 'south' },
    campfire_north:       { position: [0, 0, -1.5],   facing: 'south' },
    campfire_south:       { position: [0, 0, 1.5],    facing: 'north' },
    campfire_east:        { position: [1.5, 0, 0],    facing: 'west' },
    campfire_west:        { position: [-1.5, 0, 0],   facing: 'east' },
    tent_main:            { position: [-3, 0, -3],    facing: 'southeast' },
    tent_secondary:       { position: [3, 0, -3],     facing: 'southwest' },
    supply_pile:          { position: [2, 0, 3],      facing: 'west' },
    lookout_spot:         { position: [0, 0, 6],      facing: 'north' },
    horse_hitched:        { position: [-4, 0, 2],     facing: 'east' },
    log_sitting:          { position: [1, 0, 0.5],    facing: 'south' },
  },

  cave: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    entrance:             { position: [0, 0, 6],      facing: 'north' },
    deep_end:             { position: [0, 0, -6],     facing: 'south' },
    stalactite_drip:      { position: [-2, 0, -2],    facing: 'east' },
    rock_formation:       { position: [3, 0, -1],     facing: 'west' },
    pool_edge:            { position: [-3, 0, 1],     facing: 'east' },
    ledge_high:           { position: [2, 2, -4],     facing: 'west' },
    narrow_passage:       { position: [0, 0, 3],      facing: 'north' },
    alcove_left:          { position: [-4, 0, -3],    facing: 'east' },
    alcove_right:         { position: [4, 0, -3],     facing: 'west' },
    treasure_spot:        { position: [0, 0, -5],     facing: 'south' },
  },

  village: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    village_square:       { position: [0, 0, 0],      facing: 'south' },
    well:                 { position: [1, 0, 0],      facing: 'west' },
    house_door_1:         { position: [-4, 0, -2],    facing: 'east' },
    house_door_2:         { position: [4, 0, -2],     facing: 'west' },
    smithy_front:         { position: [-3, 0, 3],     facing: 'east' },
    church_steps:         { position: [0, 0.3, -5],   facing: 'south' },
    fence_gate:           { position: [0, 0, 6],      facing: 'north' },
    cart_parked:          { position: [3, 0, 2],      facing: 'west' },
    tree_village:         { position: [-2, 0, 1],     facing: 'east' },
  },

  city_street: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    street_center:        { position: [0, 0, 0],      facing: 'south' },
    street_ahead:         { position: [0, 0, -6],     facing: 'south' },
    street_behind:        { position: [0, 0, 6],      facing: 'north' },
    building_door_left:   { position: [-3.5, 0, -1],  facing: 'east' },
    building_door_right:  { position: [3.5, 0, -1],   facing: 'west' },
    alley_entrance:       { position: [-4, 0, 2],     facing: 'east' },
    lamppost:             { position: [2, 0, 0],      facing: 'west' },
    crate_stack:          { position: [-2, 0, 3],     facing: 'east' },
    balcony_above:        { position: [3, 3, 0],      facing: 'west' },
    gutter:               { position: [-3, 0, 0],     facing: 'east' },
  },

  temple: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    altar:                { position: [0, 0.5, -5],   facing: 'south' },
    altar_front:          { position: [0, 0, -3],     facing: 'north' },
    pew_left_front:       { position: [-2, 0, -1],    facing: 'north' },
    pew_right_front:      { position: [2, 0, -1],     facing: 'north' },
    pew_left_back:        { position: [-2, 0, 2],     facing: 'north' },
    pew_right_back:       { position: [2, 0, 2],      facing: 'north' },
    entrance:             { position: [0, 0, 6],      facing: 'north' },
    side_chapel_left:     { position: [-5, 0, -2],    facing: 'east' },
    side_chapel_right:    { position: [5, 0, -2],     facing: 'west' },
    pillar_left:          { position: [-3, 0, 0],     facing: 'east' },
    pillar_right:         { position: [3, 0, 0],      facing: 'west' },
    statue:               { position: [0, 0, -6],     facing: 'south' },
  },

  swamp: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    dry_patch:            { position: [0, 0, 0],      facing: 'south' },
    bog_edge:             { position: [-3, -0.3, 2],  facing: 'east' },
    twisted_tree:         { position: [3, 0, -2],     facing: 'west' },
    path_planks:          { position: [0, 0.1, 3],    facing: 'north' },
    hut_front:            { position: [0, 0, -4],     facing: 'south' },
    reeds:                { position: [-4, 0, 0],     facing: 'east' },
    island_small:         { position: [4, 0.1, 1],    facing: 'west' },
    bridge_rickety:       { position: [-1, 0.2, -1],  facing: 'south' },
  },

  mountain: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    ledge_main:           { position: [0, 0, 0],      facing: 'south' },
    cliff_edge:           { position: [0, 0, 5],      facing: 'south' },
    cave_mouth:           { position: [-3, 0, -4],    facing: 'east' },
    path_up:              { position: [2, 0.5, -3],   facing: 'north' },
    path_down:            { position: [-2, -0.5, 3],  facing: 'south' },
    boulder:              { position: [3, 0, 1],      facing: 'west' },
    lookout:              { position: [0, 1, -5],     facing: 'south' },
    campsite:             { position: [-2, 0, 0],     facing: 'east' },
    waterfall_base:       { position: [4, 0, -2],     facing: 'west' },
  },

  river: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    riverbank_near:       { position: [0, 0, 2],      facing: 'north' },
    riverbank_far:        { position: [0, 0, -4],     facing: 'south' },
    bridge_center:        { position: [0, 0.5, 0],    facing: 'south' },
    bridge_near:          { position: [0, 0.3, 3],    facing: 'north' },
    bridge_far:           { position: [0, 0.3, -3],   facing: 'south' },
    ford_crossing:        { position: [0, -0.2, 0],   facing: 'south' },
    fishing_spot:         { position: [-3, 0, 1],     facing: 'east' },
    boat_docked:          { position: [3, 0, 2],      facing: 'west' },
    reeds_bank:           { position: [-4, 0, 0],     facing: 'east' },
  },

  ruins: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    rubble_center:        { position: [0, 0, 0],      facing: 'south' },
    wall_broken:          { position: [-3, 0, -3],    facing: 'east' },
    arch_standing:        { position: [0, 0, -4],     facing: 'south' },
    pillar_fallen:        { position: [2, 0, 1],      facing: 'west' },
    altar_ancient:        { position: [0, 0.3, -5],   facing: 'south' },
    overgrown_corner:     { position: [-4, 0, 3],     facing: 'southeast' },
    stairway_down:        { position: [3, 0, -2],     facing: 'south' },
    collapsed_roof:       { position: [-1, 0, 2],     facing: 'north' },
    hidden_passage:       { position: [4, 0, -4],     facing: 'west' },
  },

  battlefield: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    field_center:         { position: [0, 0, 0],      facing: 'south' },
    friendly_line:        { position: [0, 0, 4],      facing: 'north' },
    enemy_line:           { position: [0, 0, -4],     facing: 'south' },
    flank_left:           { position: [-5, 0, 0],     facing: 'east' },
    flank_right:          { position: [5, 0, 0],      facing: 'west' },
    high_ground:          { position: [0, 1, -6],     facing: 'south' },
    barricade:            { position: [0, 0.3, 2],    facing: 'north' },
    fallen_banner:        { position: [-2, 0, -1],    facing: 'south' },
    supply_wagon:         { position: [3, 0, 5],      facing: 'north' },
  },

  ship: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    deck_center:          { position: [0, 0, 0],      facing: 'south' },
    helm:                 { position: [0, 1, -5],     facing: 'south' },
    bow:                  { position: [0, 0, 6],      facing: 'north' },
    stern:                { position: [0, 0, -6],     facing: 'south' },
    port_rail:            { position: [-3, 0, 0],     facing: 'east' },
    starboard_rail:       { position: [3, 0, 0],      facing: 'west' },
    mast_base:            { position: [0, 0, 1],      facing: 'south' },
    cargo_hold_entrance:  { position: [1, 0, -2],     facing: 'south' },
    cabin_door:           { position: [0, 0, -4],     facing: 'south' },
    crows_nest:           { position: [0, 8, 1],      facing: 'south' },
  },

  generic: {
    room_center:          { position: [0, 0, 0],      facing: 'south' },
    north:                { position: [0, 0, -4],     facing: 'south' },
    south:                { position: [0, 0, 4],      facing: 'north' },
    east:                 { position: [4, 0, 0],      facing: 'west' },
    west:                 { position: [-4, 0, 0],     facing: 'east' },
    northeast:            { position: [3, 0, -3],     facing: 'southwest' },
    northwest:            { position: [-3, 0, -3],    facing: 'southeast' },
    southeast:            { position: [3, 0, 3],      facing: 'northwest' },
    southwest:            { position: [-3, 0, 3],     facing: 'northeast' },
  },
};

/**
 * Default environment props per location type.
 * Each entry maps to an existing anchor and a prefab object type from prefabs.js.
 * The scene planner merges these into every scene so locations feel furnished.
 */
export const ENVIRONMENT_PROPS = {
  tavern: [
    { type: 'table',     anchor: 'table_main_surface' },
    { type: 'chair',     anchor: 'table_main_east' },
    { type: 'chair',     anchor: 'table_main_west' },
    { type: 'stool',     anchor: 'bar_counter_center' },
    { type: 'stool',     anchor: 'bar_counter_left' },
    { type: 'barrel',    anchor: 'bar_counter_behind' },
    { type: 'fireplace', anchor: 'fireplace_front' },
    { type: 'rug',       anchor: 'room_center' },
    { type: 'door',      anchor: 'door_main_inside' },
  ],
  forest: [
    { type: 'tree',       anchor: 'tree_large' },
    { type: 'tree',       anchor: 'clearing_edge_north' },
    { type: 'rock_large', anchor: 'rock_large' },
    { type: 'bush',       anchor: 'bush_hiding' },
    { type: 'bush',       anchor: 'clearing_edge_south' },
    { type: 'rock_small', anchor: 'log_sitting' },
  ],
  dungeon: [
    { type: 'pillar', anchor: 'pillar_left' },
    { type: 'pillar', anchor: 'pillar_right' },
    { type: 'torch',  anchor: 'torch_wall_left' },
    { type: 'torch',  anchor: 'torch_wall_right' },
    { type: 'chest',  anchor: 'chest_corner' },
    { type: 'door',   anchor: 'door_iron' },
    { type: 'skull',   anchor: 'altar_surface' },
  ],
  road: [
    { type: 'signpost',   anchor: 'signpost' },
    { type: 'rock_large', anchor: 'roadside_left' },
    { type: 'tree',       anchor: 'roadside_right' },
    { type: 'rock_small', anchor: 'milestone' },
    { type: 'fence',      anchor: 'ditch_left' },
  ],
  castle: [
    { type: 'banner',    anchor: 'banner_left' },
    { type: 'banner',    anchor: 'banner_right' },
    { type: 'table',     anchor: 'table_feast_surface' },
    { type: 'pillar',    anchor: 'pillar_left' },
    { type: 'pillar',    anchor: 'pillar_right' },
    { type: 'fireplace', anchor: 'fireplace_grand' },
    { type: 'rug',       anchor: 'room_center' },
    { type: 'door',      anchor: 'door_main' },
  ],
  market: [
    { type: 'cart',     anchor: 'cart_vendor' },
    { type: 'crate',    anchor: 'stall_left' },
    { type: 'crate',    anchor: 'stall_right' },
    { type: 'barrel',   anchor: 'stall_behind' },
    { type: 'fountain', anchor: 'fountain' },
    { type: 'signpost', anchor: 'notice_board' },
    { type: 'barrel',   anchor: 'stall_center' },
  ],
  camp: [
    { type: 'campfire',   anchor: 'campfire_center' },
    { type: 'crate',      anchor: 'supply_pile' },
    { type: 'barrel',     anchor: 'tent_main' },
    { type: 'rock_small', anchor: 'log_sitting' },
    { type: 'fence',      anchor: 'lookout_spot' },
  ],
  cave: [
    { type: 'rock_large', anchor: 'rock_formation' },
    { type: 'rock_small', anchor: 'stalactite_drip' },
    { type: 'torch',      anchor: 'narrow_passage' },
    { type: 'rock_large', anchor: 'alcove_left' },
    { type: 'mushroom',   anchor: 'pool_edge' },
    { type: 'chest',      anchor: 'treasure_spot' },
  ],
  village: [
    { type: 'well',     anchor: 'well' },
    { type: 'tree',     anchor: 'tree_village' },
    { type: 'cart',     anchor: 'cart_parked' },
    { type: 'fence',    anchor: 'fence_gate' },
    { type: 'door',     anchor: 'house_door_1' },
    { type: 'door',     anchor: 'house_door_2' },
  ],
  city_street: [
    { type: 'crate',    anchor: 'crate_stack' },
    { type: 'barrel',   anchor: 'alley_entrance' },
    { type: 'lantern',  anchor: 'lamppost' },
    { type: 'door',     anchor: 'building_door_left' },
    { type: 'door',     anchor: 'building_door_right' },
    { type: 'signpost', anchor: 'street_ahead' },
  ],
  temple: [
    { type: 'altar',  anchor: 'altar' },
    { type: 'pillar', anchor: 'pillar_left' },
    { type: 'pillar', anchor: 'pillar_right' },
    { type: 'bench',  anchor: 'pew_left_front' },
    { type: 'bench',  anchor: 'pew_right_front' },
    { type: 'bench',  anchor: 'pew_left_back' },
    { type: 'bench',  anchor: 'pew_right_back' },
    { type: 'statue', anchor: 'statue' },
  ],
  swamp: [
    { type: 'tree',       anchor: 'twisted_tree' },
    { type: 'rock_small', anchor: 'bog_edge' },
    { type: 'bush',       anchor: 'reeds' },
    { type: 'mushroom',   anchor: 'island_small' },
    { type: 'fence',      anchor: 'path_planks' },
  ],
  mountain: [
    { type: 'rock_large', anchor: 'boulder' },
    { type: 'rock_small', anchor: 'cliff_edge' },
    { type: 'tree',       anchor: 'campsite' },
    { type: 'rock_large', anchor: 'path_up' },
    { type: 'rock_small', anchor: 'waterfall_base' },
  ],
  river: [
    { type: 'rock_large', anchor: 'riverbank_near' },
    { type: 'bush',       anchor: 'reeds_bank' },
    { type: 'rock_small', anchor: 'fishing_spot' },
    { type: 'fence',      anchor: 'bridge_near' },
    { type: 'rock_small', anchor: 'riverbank_far' },
  ],
  ruins: [
    { type: 'pillar', anchor: 'arch_standing' },
    { type: 'rock_large', anchor: 'wall_broken' },
    { type: 'rock_small', anchor: 'collapsed_roof' },
    { type: 'statue',     anchor: 'altar_ancient' },
    { type: 'bush',       anchor: 'overgrown_corner' },
    { type: 'rock_large', anchor: 'pillar_fallen' },
  ],
  battlefield: [
    { type: 'banner',     anchor: 'fallen_banner' },
    { type: 'cart',       anchor: 'supply_wagon' },
    { type: 'fence',      anchor: 'barricade' },
    { type: 'weapon_sword', anchor: 'field_center' },
    { type: 'shield',     anchor: 'flank_left' },
    { type: 'skull',      anchor: 'enemy_line' },
  ],
  ship: [
    { type: 'barrel', anchor: 'cargo_hold_entrance' },
    { type: 'crate',  anchor: 'stern' },
    { type: 'barrel', anchor: 'port_rail' },
    { type: 'crate',  anchor: 'starboard_rail' },
    { type: 'door',   anchor: 'cabin_door' },
    { type: 'lantern', anchor: 'mast_base' },
  ],
  generic: [
    { type: 'rock_large', anchor: 'north' },
    { type: 'rock_small', anchor: 'east' },
    { type: 'bush',       anchor: 'west' },
  ],
};

/**
 * Get default environment props for a location type.
 * @param {string} locationType
 * @returns {Array<{type: string, anchor: string}>}
 */
export function getEnvironmentProps(locationType) {
  return ENVIRONMENT_PROPS[locationType] || ENVIRONMENT_PROPS.generic || [];
}

/** @type {Record<string, [number, number, number]>} */
const FACING_VECTORS = {
  north:     [0, 0, -1],
  south:     [0, 0, 1],
  east:      [1, 0, 0],
  west:      [-1, 0, 0],
  northeast: [0.707, 0, -0.707],
  northwest: [-0.707, 0, -0.707],
  southeast: [0.707, 0, 0.707],
  southwest: [-0.707, 0, 0.707],
};

/**
 * Get anchor data for a given location type and anchor name.
 * Falls back to room_center with a slight random offset if not found.
 * @param {string} locationType
 * @param {string} anchorName
 * @returns {{ position: [number, number, number], facing: string }}
 */
export function getAnchor(locationType, anchorName) {
  const loc = LOCATION_ANCHORS[locationType] || LOCATION_ANCHORS.generic;
  const anchor = loc[anchorName];
  if (anchor) {
    return { position: [...anchor.position], facing: anchor.facing };
  }
  const fallback = loc.room_center || LOCATION_ANCHORS.generic.room_center;
  const offset = (Math.random() - 0.5) * 2;
  return {
    position: [fallback.position[0] + offset, fallback.position[1], fallback.position[2] + offset],
    facing: fallback.facing,
  };
}

/**
 * Get a facing rotation in radians (Y-axis) from a facing direction string.
 * @param {string} facing
 * @returns {number}
 */
export function getFacingRotation(facing) {
  const vec = FACING_VECTORS[facing];
  if (!vec) return 0;
  return Math.atan2(vec[0], vec[2]);
}

/**
 * Get all anchor names for a location type.
 * @param {string} locationType
 * @returns {string[]}
 */
export function getLocationAnchors(locationType) {
  const loc = LOCATION_ANCHORS[locationType] || LOCATION_ANCHORS.generic;
  return Object.keys(loc);
}

/**
 * @param {string} locationType
 * @returns {boolean}
 */
export function isKnownLocation(locationType) {
  return locationType in LOCATION_ANCHORS;
}
