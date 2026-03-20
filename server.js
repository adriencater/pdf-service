var express = require('express');
var puppeteer = require('puppeteer');
var fs = require('fs');
var path = require('path');
var { PDFDocument } = require('pdf-lib');

var app = express();
var port = process.env.PORT || 3100;
var browser = null;
var idleTimeout = (process.env.IDLE_MINUTES || 60) * 60 * 1000;
var idleTimer = null;

function resetIdleTimer() {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(async function () {
		console.log('Idle timeout reached, shutting down');
		if (browser) await browser.close().catch(function () {});
		process.exit(0);
	}, idleTimeout);
}

resetIdleTimer();

// Pre-load PagedJS polyfill from node_modules
var pagedJsPath = path.join(path.dirname(require.resolve('pagedjs')), '..', 'dist', 'paged.polyfill.js');
var pagedJsScript = fs.readFileSync(pagedJsPath, 'utf8');

app.use(express.json({ limit: '50mb' }));

async function getBrowser() {
	if (!browser || !browser.connected) {
		browser = await puppeteer.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		});
	}
	return browser;
}

/**
 * Merge the main PDF with attachment PDFs.
 *
 * attachments is an array of { data: "base64..." } objects,
 * in the order they should be appended.
 */
async function mergeWithAttachments(mainPdfBytes, attachments) {
	var merged = await PDFDocument.load(mainPdfBytes);

	for (var att of attachments) {
		try {
			var attBytes = Buffer.from(att.data, 'base64');
			var attDoc = await PDFDocument.load(attBytes, { ignoreEncryption: true });
			var pages = await merged.copyPages(attDoc, attDoc.getPageIndices());
			for (var page of pages) {
				merged.addPage(page);
			}
		} catch (err) {
			console.error('Failed to merge attachment:', err.message);
			// Skip broken attachments, continue with the rest
		}
	}

	return Buffer.from(await merged.save());
}

app.post('/render', async function (req, res) {
	var html = req.body.html;
	var url = req.body.url;
	var attachments = req.body.attachments || [];

	resetIdleTimer();

	if (!html && !url) {
		return res.status(400).json({ error: 'Missing html or url in request body' });
	}

	var page;
	try {
		var b = await getBrowser();
		page = await b.newPage();
		await page.setBypassCSP(true);

		page.on('console', function (msg) {
			console.log('PAGE:', msg.text());
		});
		page.on('pageerror', function (err) {
			console.error('PAGE ERROR:', err.message);
		});

		// Load content: navigate to URL or set HTML directly
		if (url) {
			await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
		} else {
			await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
		}

		// Set up completion flag, then inject PagedJS via addScriptTag
		await page.evaluate(function () {
			window.__pagedjs_done = false;
			window.PagedConfig = {
				after: function () {
					window.__pagedjs_done = true;
				}
			};
		});

		await page.addScriptTag({ content: pagedJsScript });

		// Wait for PagedJS to fully finish rendering all pages
		await page.waitForFunction('window.__pagedjs_done === true', {
			timeout: 120000,
			polling: 500
		});

		var pdf = await page.pdf({
			format: 'A4',
			printBackground: true
		});

		// Merge with attachment PDFs if any
		var result = pdf;
		if (attachments.length > 0) {
			result = await mergeWithAttachments(pdf, attachments);
		}

		res.set('Content-Type', 'application/pdf');
		res.end(Buffer.from(result));
	} catch (err) {
		console.error('PDF render error:', err.message);
		res.status(500).json({ error: err.message });
	} finally {
		if (page) await page.close().catch(function () {});
	}
});

app.get('/health', function (req, res) {
	res.json({ status: 'ok' });
});

app.listen(port, function () {
	console.log('PDF service listening on port ' + port);
});

process.on('SIGTERM', async function () {
	if (browser) await browser.close();
	process.exit(0);
});
