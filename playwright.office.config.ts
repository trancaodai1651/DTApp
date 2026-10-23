import { defineConfig,devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const windowsChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
 testDir:'tests/office/e2e',timeout:45000,expect:{timeout:10000},fullyParallel:false,workers:1,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:5174',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(existsSync(windowsChrome)?windowsChrome:undefined),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI,timeout:30000},
});
