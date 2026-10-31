-- Landmark NAMES are supplied by the project owner. Coordinates are 0,0 PLACEHOLDERS and is_verified=false.
-- Replace with surveyed positions from Admin -> Landmarks before relying on any location data.
insert into institutions (name, slug, default_fare_kobo) values ('Babcock University','babcock',20000)
  on conflict (slug) do nothing;
insert into campus_locations (institution_id, name, description, latitude, longitude, is_verified)
select id, n, 'Name supplied by project owner; map position not verified', 0, 0 + o, false
from institutions,
  (values ('CAF',0.0001),('BUSA',0.0002),('Big Meal',0.0003),('Guest House',0.0004),
          ('Amphitheatre',0.0005),('Emerald Hall',0.0006)) v(n,o)
where slug='babcock';
