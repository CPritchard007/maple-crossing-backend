# Border debriefing reference

The frontend payload is `demo-border-debriefing.txt`. Its narration intentionally contains no test disclaimers. This is an internal test fixture: the closure, 18/29-minute travel times, CAD 7/10 tolls, and resulting ranking are test inputs, not live findings. The comparison covers only the Ambassador Bridge and Detroit–Windsor Tunnel.

## Geometry

Retrieved 2026-09-27 from OpenStreetMap contributors (ODbL):

- [Windsor street extract](https://www.openstreetmap.org/api/0.6/map?bbox=-83.044,42.308,-83.030,42.318)
- [Ambassador Bridge extract](https://www.openstreetmap.org/api/0.6/map?bbox=-83.077,42.310,-83.068,42.315)
- [Copyright and attribution](https://www.openstreetmap.org/copyright)

All path coordinates are original OSM nodes, preserved without interpolation or invented connectors. The Goyeau closure runs from its Elliott intersection (node 251549017) to its Wyandotte intersection (node 251549016). The detour connects these same endpoints via Elliott, Ouellette, and Wyandotte without using any interior closure node. Directed edges respect OSM one-way tags; applicable complete turn restrictions in the extract were checked. This is a geometry check, not live navigation or a live closure assessment.

The source labels the Elliott and Wyandotte segments “West,” including east of Ouellette. Narration uses the unambiguous base street names without a directional suffix.

Source ways, in closure/detour order:

- [Goyeau Street, way 90546630](https://www.openstreetmap.org/way/90546630)
- [Elliott Street West, way 23721788](https://www.openstreetmap.org/way/23721788)
- [Ouellette Avenue, way 1077015004](https://www.openstreetmap.org/way/1077015004)
- [Ouellette Avenue, way 1077015002](https://www.openstreetmap.org/way/1077015002)
- [Ouellette Avenue, way 1077015007](https://www.openstreetmap.org/way/1077015007)
- [Ouellette Avenue, way 421878288](https://www.openstreetmap.org/way/421878288)
- [Ouellette Avenue, way 421878289](https://www.openstreetmap.org/way/421878289)
- [Wyandotte Street West, way 188307606](https://www.openstreetmap.org/way/188307606)
- [Wyandotte Street West, way 1359579396](https://www.openstreetmap.org/way/1359579396)
- [Wyandotte Street West, way 421878292](https://www.openstreetmap.org/way/421878292)

Destination markers:

- [Ambassador Bridge node 4318818410](https://www.openstreetmap.org/node/4318818410): 42.3118477, -83.0739929, on way 4898838.
- [Tunnel portal node 253570529](https://www.openstreetmap.org/node/253570529): 42.3158962, -83.0367874, on way 105530680. This marks the tunnel portal, not a turn instruction into the plaza.
- [Tunnel operator contact page](https://takethetunnel.com/contact/): Windsor facility address, 555 Goyeau Street.

## Playback

Every map command precedes its associated narration, including the initial closure and both crossing views. Blue informational highlights use `type="summary"`: `info` is not supported by the current frontend parser. The `reroute` action displays the supplied path; it does not calculate or change a navigation route. Highlights replace one another.
