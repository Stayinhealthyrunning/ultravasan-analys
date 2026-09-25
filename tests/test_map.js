'use strict';

const assert=require('assert');
const map=require('../docs/assets/map.js');

const route2024={source_year:2024};
const exactRegistry={edition_route_contracts:{
  'ultravasan90-2024':{
    display_route_id:'ultravasan90-post2023',
    display_geometry_usage:'exact-source-year',
    display_geometry_source_year:2024,
    course_version_id:'uv90-2023-2025-v1',
    whole_course_comparison_group:null,
  },
}};
const sharedRegistry={edition_route_contracts:{
  'ultravasan90-2025':{
    display_route_id:'ultravasan90-post2023',
    display_geometry_usage:'verified-shared-course',
    display_geometry_source_year:2024,
    course_version_id:'uv90-2023-2025-v1',
    whole_course_comparison_group:'ultravasan90-2024-2025',
  },
}};
const referenceRegistry={edition_route_contracts:{
  'ultravasan90-2026':{
    display_route_id:'ultravasan90-post2023',
    display_geometry_usage:'reference-only',
    display_geometry_source_year:2024,
    course_version_id:'uv90-2026-v1',
    whole_course_comparison_group:null,
  },
}};

assert.strictEqual(
  map.displayGeometryStatus(exactRegistry,{race_key:'ultravasan90-2024'},route2024),
  'verifierad årsgeometri 2024'
);
assert.strictEqual(
  map.displayGeometryStatus(referenceRegistry,{race_key:'ultravasan90-2026'},route2024),
  'kartreferens från 2024'
);
assert.strictEqual(
  map.displayGeometryStatus(sharedRegistry,{race_key:'ultravasan90-2025'},route2024),
  'verifierad delad bana från 2024'
);
assert.strictEqual(
  map.displayGeometryStatus({}, {race_key:'ultravasan90-2023'}, route2024),
  'kartreferens 2024'
);

console.log('test_map.js: OK');
