# MyHomeMaker tutorial — building an up-to-date website

This document follows the in-app **Tutorial** step by step, with a picture of each step taken from the real app. Starting from an empty site it builds **four pages (Home, Pricing, About, Contact)** for “FlowNote”, an AI note app, then refines the design, checks it on a phone, checks the problems and the spelling, and publishes it.

## Running the tutorial

- **Start page › Start tutorial**, the **Tutorial** toolbar button, **Help › Tutorial** or **F11**.
- In the card: **Next / Previous** one step at a time, **Auto play** to the end, the chapter list to jump to a chapter, **✕** or **Esc** to stop at any time.
- Whichever step you jump to, the site appears as it is at that step.
- The tutorial works on a site of its own. Your open sites are not changed, and the theme, language, dictionary and view settings it changes are put back when it ends.
- A video of the whole tour: `doc/video/MyHomeMaker-Tutorial.en.mp4` (the same file is in the project folder). `npm run tutorial:video` makes it again.

## What makes a website up to date — and where the tutorial does it

| Trend | In the tutorial |
| --- | --- |
| One bold message on the first screen | the hero banner, a short strong title |
| Bento grid | the Features block, two columns, four boxes |
| Showing trust | logos, numbers, reviews |
| One clear next step | the hero button, the sticky header button, the closing call to action |
| Dark mode with a bright accent | the Aurora design, a pink accent, round corners |
| Mobile first | tablet and phone widths, preview |
| Search engines and accessibility | the site description and keywords, alt text, spelling |
| A fast, safe static site | published as an HTML/CSS folder or a ZIP |

## Contents

1. Getting started
2. Building the home page
3. Adding pages
4. Design
5. Phones and tablets
6. Checking
7. Publishing
8. Finishing up

## 1. Getting started

### 1. Welcome to MyHomeMaker

This tutorial builds a real website from an empty site: “FlowNote”, four pages (Home, Pricing, About, Contact), all the way to publishing. Press Next on this card, or Auto play.

![Welcome to MyHomeMaker](images/en/tutorial/01-welcome.png)

### 2. What we will build

It follows how sites are made today: one bold message on the first screen, features in a bento grid, trust shown with logos, numbers and reviews, a clear next step on every page, dark mode, a phone-first check, a search description and a spelling check.

![What we will build](images/en/tutorial/02-plan.png)

### 3. A new site

New (Ctrl+N) starts from an empty site, one of 12 templates or one of 40 samples. Give it a name, choose a design and press Create. Here we start an empty site called “FlowNote”.

![A new site](images/en/tutorial/03-newSite.png)

### 4. The workspace

On the left the Blocks panel, in the middle the canvas (drawn exactly like the published site), on the right the pages and blocks with the Content, Style, Page and Site editors, and at the bottom the Problems panel. We stack blocks onto the empty home page.

![The workspace](images/en/tutorial/04-workspace.png)

## 2. Building the home page

### 5. The first screen: a hero

Visitors should know what the site is about within three seconds. Click “Hero banner” in the Blocks panel to add it below the selected block, or drag it to the place you want on the canvas.

![The first screen: a hero](images/en/tutorial/05-hero.png)

### 6. Edit the text right on the page

Click the title and type. One short, bold sentence is the heart of today's first screens. A typo slipped in on purpose: the spelling check finds and fixes it later, in “Checking”.

![Edit the text right on the page](images/en/tutorial/06-heroText.png)

### 7. Buttons and links: one next step

Set the button labels and links in the Content tab. The main button (Start for free) goes to the Pricing page (pricing.html), the second to the features further down (#features). The picture is changed here too.

![Buttons and links: one next step](images/en/tutorial/07-heroButtons.png)

### 8. Trust: the logos of your users

Showing who uses it right under the first screen builds trust. The Logos block lines up company names or logo pictures in one row.

![Trust: the logos of your users](images/en/tutorial/08-logos.png)

### 9. Features in a bento grid

A grid of cards, like the boxes of a bento, is today's favourite way to show features. The Features block in two columns holds four boxes with an icon, a title and a short line. Add, remove and reorder them in the Content tab.

![Features in a bento grid](images/en/tutorial/09-bento.png)

### 10. Numbers that speak

Numbers like “3 min” or “1,200+” are read faster than long sentences. The Numbers block shows four big figures on a dark band.

![Numbers that speak](images/en/tutorial/10-stats.png)

### 11. Reviews

A line from a real user persuades best. The Testimonials block shows a short quote with a photo, a name and a role.

![Reviews](images/en/tutorial/11-testimonials.png)

### 12. Ask once more at the end

Invite visitors who scrolled to the end to take the next step. The Call to action block puts a title and one button on a band of strong colour.

![Ask once more at the end](images/en/tutorial/12-cta.png)

### 13. Changing the order

Move a block with the ↑ ↓ buttons on its bar, Ctrl+↑/↓, or by dragging its name tab — or drag it in the list of pages and blocks. Undo (Ctrl+Z) puts anything back.

![Changing the order](images/en/tutorial/13-reorder.png)

### 14. The header: a menu that stays

The header is the same on every page. Set the site name and the button on the right (Start free); with “Stick to the top” on, the menu and the button stay visible while visitors scroll.

![The header: a menu that stays](images/en/tutorial/14-header.png)

### 15. The footer

The footer is on every page too: a short line about you, contact details, the copyright line and social links. The page links fill themselves in.

![The footer](images/en/tutorial/15-footer.png)

## 3. Adding pages

### 16. Adding a page

Add a page with + on the tab row or Page › Add page (Ctrl+Shift+N). Call it “Pricing” and start it empty or with a common layout. Its file name (pricing.html) is chosen for you.

![Adding a page](images/en/tutorial/16-addPage.png)

### 17. The Pricing page

The Pricing page: a heading, the price table and frequently asked questions. The price table highlights the recommended plan, and each question opens on a click.

![The Pricing page](images/en/tutorial/17-pricing.png)

### 18. The About page

“Our story” (a picture with text), the team and the journey give the company a face. Click the tabs to move between pages, drag them to reorder.

![The About page](images/en/tutorial/18-about.png)

### 19. The Contact page

We finish with a contact form, a newsletter sign-up and social links. With an e-mail address or a form service address filled in, the form works on the published site.

![The Contact page](images/en/tutorial/19-contact.png)

### 20. The menu builds itself

Every page you add appears in the header menu and the footer by itself. The list on the right shows all pages and blocks; the Page tab says whether a page is in the menu.

![The menu builds itself](images/en/tutorial/20-nav.png)

## 4. Design

### 21. Choosing a design

A design (Ctrl+Shift+D) changes the colours, fonts, corners and width at once. There are 24 light and 12 dark designs, previewed as you pick.

![Choosing a design](images/en/tutorial/21-designs.png)

### 22. Dark mode

Light text and glowing accents on a dark background are the look of today's tech products. We switch to the “Aurora” design. In every design the text keeps enough contrast to read easily.

![Dark mode](images/en/tutorial/22-darkMode.png)

### 23. Your own colour and corners

The Site tab changes parts of the design. Here the accent colour becomes pink and the corners rounder. “Reset design” takes it back at any time.

![Your own colour and corners](images/en/tutorial/23-accent.png)

### 24. Background and spacing per section

The Style tab sets a block's background (none, surface, primary, accent, dark or a colour of your own), top and bottom space, alignment and width. Alternating backgrounds make a long page easy to read.

![Background and spacing per section](images/en/tutorial/24-sectionStyle.png)

## 5. Phones and tablets

### 25. Tablet and phone widths

Most visitors use a phone. Check the site with the desktop, tablet and phone buttons of the toolbar: columns stack into one, and the menu folds into a ☰ button.

![Tablet and phone widths](images/en/tutorial/25-devices.png)

### 26. Preview

Preview (Ctrl+E) shows the site the way visitors see it, without editing marks; menu links switch pages. F5 opens it in your real browser.

![Preview](images/en/tutorial/26-preview.png)

## 6. Checking

### 27. The Problems panel

The Problems panel at the bottom lists what to fix (errors, warnings) and words the dictionaries do not know (spelling), checked again after every change. Open and fold it with the panel button of the toolbar or Ctrl+J.

![The Problems panel](images/en/tutorial/27-problems.png)

### 28. Fixing a typo

The English and Korean dictionaries found the typo on the first screen. Click the row to see where it is on the canvas, double-click to go to the field with the word selected. A suggestion button or the right-click menu fixes it at once.

![Fixing a typo](images/en/tutorial/28-spelling.png)

### 29. New words go into the dictionary

A word that is right but not in the dictionary, such as a product name: press “Add to dictionary”. Tools › Dictionary (the Dictionary tab of Settings) shows, finds and removes your words.

![New words go into the dictionary](images/en/tutorial/29-dictionary.png)

### 30. A description for search engines

The title, description and keywords of the Site tab appear in search results and link previews. With the description filled in, the last warning is gone. The alt text of pictures matters for search and accessibility too.

![A description for search engines](images/en/tutorial/30-seo.png)

## 7. Publishing

### 31. Saving

Save (Ctrl+S) keeps the whole site in one .myhome file to open and change later. Save a layout you reuse as a template (.mhomt).

![Saving](images/en/tutorial/31-save.png)

### 32. Publishing

Publish (Ctrl+Shift+P) writes an HTML file per page, one style sheet and a pictures folder, as a folder or a ZIP, and checks the problems once more before.

![Publishing](images/en/tutorial/32-publish.png)

### 33. Open it in a browser

F5 opens the site in your real browser. Try other browsers and a real phone as well.

![Open it in a browser](images/en/tutorial/33-browser.png)

### 34. Putting it online

The published folder is a static site, fast and safe, ready to upload as it is. Upload the folder or the ZIP to free hosting such as GitHub Pages, Netlify or Cloudflare Pages and it gets an address.

![Putting it online](images/en/tutorial/34-hosting.png)

## 8. Finishing up

### 35. Make it yours

Settings change the theme (over 40 light and dark), the language, the font, the start page, the spelling check and your dictionary. The theme button of the toolbar picks one at random, the ▾ next to it lists them.

![Make it yours](images/en/tutorial/35-customize.png)

### 36. Help

Help › User's guide and the tutorial document explain every feature with pictures. Shortcuts are listed in the Shortcuts tab of Settings.

![Help](images/en/tutorial/36-help.png)

### 37. Done!

From an empty site to a four-page, up-to-date homepage — checked and published. Now open a sample or make your own site. Run the tutorial again with its toolbar button or F11.

![Done!](images/en/tutorial/37-finish.png)

## Learn more

- Every feature is described in the [User's guide](UsersGuide.en.md).
- Open one of the 40 samples (File › Open sample) to see how they are made.
