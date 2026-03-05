# Wasatch Mahjong Style Guide

## Brand Colors

| Name         | Hex     | Use Case                                    |
| ------------ | ------- | ------------------------------------------- |
| Deep Red     | #9b0000 | Primary CTA, bold accents, key typography   |
| Elegant Blue | #374696 | Secondary buttons, structure, subtle motifs |
| Soft Gray    | #787878 | Secondary text, borders, muted backgrounds  |
| Off-White 1  | #fafafa | Main backgrounds, soft sections             |
| Off-White 2  | #f5f5f5 | Alternate backgrounds, cards, hero sections |

## Typography

- **Headings (H1-H6):**
  - Font: "Playfair Display", serif (classy, elegant)
  - Weight: 700 (bold)
  - Letter spacing: -0.5px (tight, modern)
- **Body Text:**
  - Font: "Inter", sans-serif (friendly, highly readable)
  - Weight: 400 (regular), 500 (medium)
  - Letter spacing: 0px
- **Sizing:**
  - H1: 2.5rem (40px)
  - H2: 2rem (32px)
  - H3: 1.5rem (24px)
  - H4: 1.25rem (20px)
  - H5: 1.125rem (18px)
  - H6: 1rem (16px)
  - Body: 1rem (16px)

## Spacing & Border Radius

- **Spacing:**
  - Use multiples of 4px (4, 8, 12, 16, 24, 32, 40, 48, 64)
  - Generous padding for cards and sections
- **Border Radius:**
  - Default: 16px (for cards, buttons, inputs)
  - Buttons: 9999px (fully rounded for "cute" pill look)

## Buttons

- **Primary:** Deep Red background, white text
- **Secondary:** Elegant Blue background, white text
- **Outline:** Transparent background, Deep Red border, Deep Red text
- **States:**
  - Hover: Slightly darker shade, subtle shadow
  - Disabled: Soft Gray background, muted text

### Example Button Classes

- Primary: `bg-wasatch-red text-white rounded-full hover:bg-[#7a0000]`
- Secondary: `bg-wasatch-blue text-white rounded-full hover:bg-[#2a3573]`
- Outline: `border-2 border-wasatch-red text-wasatch-red bg-transparent rounded-full hover:bg-[#f5f5f5]`
- Disabled: `bg-wasatch-gray text-white opacity-60 cursor-not-allowed`

## Card Style

- Background: #f5f5f5
- Border radius: 16px
- Shadow: `shadow-md`
- Padding: 24px
- Example: `bg-wasatch-card rounded-2xl shadow-md p-6`

---

## Example Usage

```jsx
<Button variant="primary">Join a Game</Button>
<Button variant="secondary">Learn More</Button>
<Button variant="outline">Contact</Button>

<Card>
  <h3>Beginner Mahjong Class</h3>
  <p>Learn the basics of American Mahjong in a fun, friendly environment!</p>
</Card>
```

---

## Accessibility

- Ensure all color contrasts meet WCAG AA standards.
- Use sufficient padding and font sizes for readability.
- All interactive elements must have visible focus states.
