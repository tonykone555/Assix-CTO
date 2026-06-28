const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let browser;
let context;
let page;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('start-session', async () => {
    try {
      if (!browser) {
        browser = await chromium.launch({ headless: true });
      }
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
      });
      page = await context.newPage();

      console.log('Session started');
      socket.emit('session-started');

      // Start screenshot loop
      const streamScreenshots = async () => {
        if (!page || page.isClosed()) return;
        try {
          const buffer = await page.screenshot({ type: 'jpeg', quality: 50 });
          socket.emit('screenshot', buffer.toString('base64'));
          setTimeout(streamScreenshots, 100); // 10 FPS
        } catch (e) {
          console.error('Screenshot error:', e.message);
        }
      };
      streamScreenshots();

    } catch (error) {
      console.error('Error starting session:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('navigate', async (url) => {
    if (!page) return;
    try {
      await page.goto(url);
      console.log('Navigated to:', url);
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  socket.on('action', async ({ type, selector, text }) => {
    if (!page) return;
    try {
      if (type === 'click') {
        await page.click(selector);
      } else if (type === 'type') {
        await page.fill(selector, text);
      } else if (type === 'press') {
        await page.press(selector, text);
      }
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected');
    // For now, keep the browser running or close it if no users?
    // Let's close page/context for this user.
    if (page) await page.close();
    if (context) await context.close();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
