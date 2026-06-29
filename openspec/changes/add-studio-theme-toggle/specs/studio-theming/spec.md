# Spec Delta: studio-theming

## ADDED Requirements

### Requirement: Light and dark palettes
The studio SHALL define both a light and a dark palette for its theme tokens, and the active palette SHALL be selected by a class on the document root so that all components — which consume the tokens — reskin without per-component changes. The document's `color-scheme` SHALL match the active palette.

#### Scenario: Switching palettes reskins the app
- **WHEN** the active theme changes between light and dark
- **THEN** every view re-renders with the corresponding palette and `color-scheme`, with no change to component markup

### Requirement: Light/dark/system toggle with persistence
The studio SHALL provide a control to choose light, dark, or system theme. The choice SHALL persist across reloads. In system mode the studio SHALL follow the operating system's color-scheme preference and update live when that preference changes. With no stored choice the default SHALL be system.

#### Scenario: Choice persists across reloads
- **WHEN** a user selects light or dark and reloads the studio
- **THEN** the studio renders in the chosen theme

#### Scenario: System mode tracks the OS
- **WHEN** the theme is set to system and the operating system switches between light and dark
- **THEN** the studio updates to match without a reload

### Requirement: No flash of the wrong theme
The studio SHALL apply the resolved theme before the first paint, so the page does not render one theme and then switch to the stored or system theme.

#### Scenario: First paint is already the right theme
- **WHEN** the studio loads with a stored or system-resolved theme
- **THEN** the initial paint is in that theme, with no visible flash of the other theme
