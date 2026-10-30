# Canvas Flow Studio

Make sure no element can ever go outside the screen, like off-screen. Also make it so that adding different sized canvases to the stack doesn't change their size or crop them according to the top sprite of the stack. They should stay like that. And also make the stack a little more like, you know, obvious that it's a stack by like rotating the added canvases a little more. Not too much, but a little more You should be able to scrub back and forth horizontally or vertically with three fingers to clear a layer. You should be able to swipe down with three fingers to see cut, copy and paste options for the current layer. You should be able to use four fingers to tap on the screen to full screen. Can you add the ability to use unlimited layers on any canvas size? To Start a stack. You should be able to press and hold on a canvas and then press on another canvas with another finger or another hand's finger to put both of them on a stack. You can also press and hold on a stack and then press on a canvas or press and hold on a canvas and press on a stack to add the canvas to the stack The fade bottom shadow behind the name that is on the canvases and stacks. Well, the one on the stacks doesn't fit and is weird. Look at the screenshot. Like it should fit to the canvas on top and stuff. Not look weird. The layer bar should always open in compact mode. Replace the current brush library with the given brushes in the zips. Also fix the picture in picture color pickers because right now all of them are broken. All of them look bad. Try to test them and see how they are broken and fix them. Also resizing those color pickers picture-in-picture mode when they are resized, they jump to below your fingers for some reason, which is like really bad. Why does that happen? Fix that Can you also add the picture-in-picture mode to the color palettes? Like it should be a button on each individual palette. The drag and drop color thing shouldn't be on a palette unless you, okay never mind that one. Add a button on the drag and drop bar that comes up when you, well, drag and drop. That turns off edge detection entirely. The button should be inside the little drag and drop bar on the left I mean right I guess just like how the tick button is! Now this is persistent and you will need to just drag and drop again. And if it was turned off, it will stay turned off until you manually turn it off. You can also add this to the settings. Test and fix resizing on all resizable elements. Make opacity and size sliders be resizable. Try moving all the resizable and movable elements around and make sure nothing goes out of screen and everything can move into their respective positions where they are supposed to be. If not, fix them Rename the PREFS in the actions window to settings to make it consistent. On the first button that is after the settings button on the gallery, that little tick mark, add a stack button that comes up when you click that. You know how it shows you options like duplicate, share and other stuff. There should be a stack option too. The select button. It lets you select stuff, right? So you can select and stack. Make the gallery elements like the select, import file and import image the settings and the make new canvas appear inside stacks as well. You should probably make space for those at the bottom. So like yeah The stuff in the stacks should still be able to be scrolled and when it goes below those things, it should have that little fade out effect as well. Make every window that comes up when you click the color pick option on the toolbar from the harmony to the color palettes and other stuff appear full and have no scrolling whatsoever. Well, except the, never mind. Yeah, except the palettes because you can add multiple so it will eventually need scrolling.



One more thing, look at the screenshot. Whenever scrolling is used, it always cuts off the elements that are being scrolled very harshly. Make sure that that cut off as shown in the screenshots is smooth and rounded so it doesn't look bad and janky

Make sure this is a new project. Also make sure that every window and menu is a nice liquid glass and consistently at that. Sure there can be variation but there should also be consistency. Do a check pass on that.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/513ce98a-749a-444d-8831-23b9435052c9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
