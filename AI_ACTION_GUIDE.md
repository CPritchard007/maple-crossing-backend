# AI response guide: narration and map actions

Use this guide when generating responses for the Maple Crossing app. Return plain text with inline `((geo ...))` and `((highlight ...))` commands. Do not wrap an app response in Markdown fences, JSON, or explanations of the command syntax.

## How the app plays a response

The response is processed from left to right:

1. Collect the text before the next action command.
2. Display that text in the map overlay and speak it through Amazon Polly.
3. Wait for speech to finish.
4. Execute the command and wait for the map camera animation to finish.
5. Display and speak the next text segment, then execute its following command.
6. Continue until there is no text or action left. Text after the last command is also displayed and spoken.

The action command itself is never displayed as narration or spoken. Previous text stays visible during the map action and until another nonempty text segment replaces it. An action with no preceding text runs without speech and retains the previous overlay text. The app starts with no narration text.

**Move to the location BEFORE talking about it. No exceptions.** Place the `geo` or `highlight` command before any narration that names, introduces, describes, or recommends that location, road, closure, detour, or crossing. The app must finish the camera animation before speaking about the resulting view. A `highlight` command already moves and frames the camera, so a separate `geo` is not required.

Start the response with a map action. For every new location, use the order **map action → narration about that location → next map action → narration about the next location**. Never announce an upcoming location in the preceding narration (for example, “Next, let’s look at Lauzon Road”). When returning to a previously discussed location, focus it again before discussing it. This rule also applies to introductions, comparisons, summaries, demo responses, and closing recommendations; do not discuss an off-screen location before moving to it.

Example:

```text
((geo lat="42.3149" lng="-83.0364"))
The map is now focused on the Windsor tunnel entrance.
((highlight name="Lauzon Road" type="recommendation" path="42.326792,-82.9397677;42.3261168,-82.9393305;42.3254421,-82.938907;42.3246604,-82.9384236;42.3241214,-82.9380766;42.3236127,-82.9378624"))
The green section shows Lauzon Road. That completes this demonstration.
```

This example demonstrates narration, a location move, a road highlight, and final narration. It makes no claim about current traffic conditions.

## Move the map: geo

```text
((geo lat="42.3149" lng="-83.0364"))
```

A bare `geo` command moves the camera to the coordinates without drawing an action marker. It replaces any previous action highlight. It does not request device location or calculate a driving route.

## Highlight a road: highlight with path

```text
((highlight name="Lauzon Road" type="hazard" path="42.326792,-82.9397677;42.3261168,-82.9393305;42.3254421,-82.938907;42.3246604,-82.9384236;42.3241214,-82.9380766;42.3236127,-82.9378624"))
```

`path` contains semicolon-separated `latitude,longitude` pairs in the order the road follows. The app draws connected segments between these coordinates and frames the path with the camera. It does not snap coordinates to roads or look up geometry from `name`.

Use verified road geometry when identifying an actual road. This is required for demos and fictional traffic scenarios too: closures, waits, and tolls may be simulated, but road names and coordinates must be real and sourced. Never substitute invented roads or schematic paths. Preserve the source coordinates in road order and verify that detour segments connect and avoid the closed segment. Keep geometry sources in a companion reference file rather than spoken narration. If geometry is unavailable, ask for it or use a verified point with `geo`. A road name alone is not a valid action.

The red example illustrates styling only; do not infer a real hazard from these example coordinates.

## Point and destination highlights

A `highlight` command with `lat` and `lng` defaults to a point marker:

```text
((highlight lat="42.3149" lng="-83.0364" type="recommendation"))
```

Use `highlight="destination"` for the larger destination marker:

```text
((highlight lat="42.3149" lng="-83.0364" highlight="destination" type="summary"))
```

## Attributes and defaults

| Attribute | Accepted values and behavior |
| --- | --- |
| `lat`, `lng` | Required for point, destination, and unhighlighted location actions. Finite decimal degrees; latitude −90 to 90, longitude −180 to 180. |
| `path` | Required for path highlights. Between 2 and 1,000 coordinate pairs. Cannot be combined with `lat` or `lng`. |
| `name` | Optional descriptive metadata. Does not trigger a place search, road lookup, or visible label. |
| `type` | `recommendation` (green, default), `hazard` (red), or `summary` (blue). |
| `highlight` | `none`, `point`, `path`, or `destination`. Bare `geo` defaults to `none`; `highlight` defaults to `path` when a path is provided, otherwise `point`. |
| `action` | `waypoint` (default), `reroute`, or `terminate`. See below. |

`waypoint` focuses the supplied geometry. `reroute` also focuses/highlights supplied geometry; it does **not** compute or change a navigation route. `terminate` ends the current notice after its preceding narration and map action; it does not close the app or its backend instance.

**Do not place text or another command after `action="terminate"`.** For narration about the final location, omit `terminate` and let the response end naturally after that narration. If using `terminate`, first focus the final location with a non-terminating command, then narrate it, then terminate at the same geometry. Never use `terminate` to bypass the mandatory move-before-narration rule.

Legacy combined commands are also supported:

```text
((geo lat="42.3149" lng="-83.0364" highlight="point" type="recommendation" action="waypoint"))
```

Prefer `geo` for movement and `highlight` for drawing attention to a point or road.

## Visual behavior

- Each map action replaces the previous action highlight; highlights do not accumulate.
- After the entire response finishes, including trailing speech, the app clears the action highlight and returns to the user’s location. If location permission was denied or no location is available, the last highlight remains visible. Pauses between streamed chunks or narration segments do not trigger a return. The frontend requests foreground location permission at startup; no extra AI action is needed.
- Road highlights have a thick central line and pulsing outer layers.
- Point and destination markers use different sizes, with destinations larger.
- The web camera fits the geometry, allowing zoom up to 17 for highlights and 15 for bare location actions. Long paths may require a wider view.
- Status colors are intentional: omitted `type` means green, even though the app's initial demonstration road is red.
- Size, pulse, zoom, and camera timing are controlled by the app, not extra command attributes.

## Formatting and validation

- Every location-specific narration must follow the map action that focuses that location. No exceptions; check this ordering separately from parser validation.
- Use lowercase command and attribute names exactly as documented.
- Quote every attribute value with straight single or double quotes.
- Separate attributes with whitespace.
- Use `((` and `))` only for action commands in generated responses.
- Do not nest commands, duplicate attributes, add unsupported attributes, or leave commands unclosed.
- Coordinates are always **latitude first, longitude second** in generated commands.
- Do not provide `path` unless the highlight kind is `path`.
- Complete responses are validated before any narration or map effects. Invalid input rejects the whole response.
- Streaming responses preserve text order across arbitrary chunk boundaries. Complete steps execute as they arrive; a later error cannot undo earlier actions.
- Maximum response size is 1 MiB of Dart string code units; individual command tags are limited to approximately 32 KiB. Keep narration concise and geometry appropriately bounded.
- Only one action feed runs at a time. Cancellation stops narration and prevents later actions.

## Integration responsibilities

The Flutter `ActionService` consumes either a complete response string (`execute`) or a stream of decoded text chunks (`consume`). Feed it the text content, not raw SSE framing or JSON envelopes. This service does not itself connect to an AI provider.

The backend `POST /api/speech` endpoint accepts narration text and returns Polly audio. It does not interpret map commands. The frontend separates narration from commands and splits long narration into requests within Polly's limits. AWS credentials remain on the backend.

The app menu includes **Test narration, geo & highlight**, which runs a built-in example of the full sequence. Speech needs a working backend/AWS configuration and browser audio permission through user interaction.

Implementation references:

- Frontend parser and sequencing: `../maple_crossing_app/lib/services/action_service.dart`
- Frontend camera and rendering: `../maple_crossing_app/lib/screens/map_screen.dart`
- Built-in test example: `../maple_crossing_app/lib/components/action_command_form.dart`
- Backend speech endpoint: `app/api/speech/route.ts`

When changing the protocol, keep this guide, the parser, and the action tests consistent.
