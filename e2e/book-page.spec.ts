import fs from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";

const BOOK_PATH = "/mobile-baseline";
const MOBILE_PROJECT = "mobile-webkit-iphone";
const SUBPIXEL_TOLERANCE = 1;

type Bounds = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

async function boundsFor(locator: Locator, name: string): Promise<Bounds> {
  const bounds = await locator.boundingBox();
  if (!bounds) {
    throw new Error(`Missing bounds for ${name}`);
  }
  return bounds;
}

function overlaps(first: Bounds, second: Bounds) {
  return (
    first.x < second.x + second.width - SUBPIXEL_TOLERANCE &&
    first.x + first.width > second.x + SUBPIXEL_TOLERANCE &&
    first.y < second.y + second.height - SUBPIXEL_TOLERANCE &&
    first.y + first.height > second.y + SUBPIXEL_TOLERANCE
  );
}

async function paintedLineCount(locator: Locator) {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const lineTops = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .reduce<number[]>((tops, rect) => {
        if (!tops.some((top) => Math.abs(top - rect.top) < 0.5)) {
          tops.push(rect.top);
        }
        return tops;
      }, []);
    return lineTops.length;
  });
}

test("renders the representative book page", async ({ page }, testInfo) => {
  await page.goto(BOOK_PATH);

  await expect(
    page.getByRole("heading", {
      name: "Playwright Mobile Baseline Book",
      level: 1,
    })
  ).toBeVisible();
  await expect(
    page.getByText("This fixture book gives the E2E suite deterministic prose to render.")
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Chapter 1: Narrow Screen Chapter/ })
  ).toBeVisible();
  await expect(
    page.getByText("This chapter provides ordinary paragraph text for browser smoke coverage.")
  ).toBeVisible();

  const header = page.locator(".main-header");
  const headerTitle = header.getByRole("link", {
    name: "Playwright Mobile Baseline Book",
  });
  const userLabel = header.getByText("Anonymous User", { exact: true });
  const userDropdown = header.locator(".user-dropdown");

  await expect(headerTitle).toBeVisible();
  await expect(userDropdown).toBeVisible();

  if (testInfo.project.name !== MOBILE_PROJECT) {
    await expect(userLabel).toBeVisible();
    return;
  }

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const homeIcon = header.locator("svg.home-icon");
  const avatarIcon = userDropdown.locator("svg");
  await expect(homeIcon).toBeVisible();
  await expect(avatarIcon).toBeVisible();

  const relevantHeaderElements = [
    ["left controls", header.locator(".header-left")],
    ["title", headerTitle],
    ["right controls", header.locator(".header-right")],
    ["home icon", homeIcon],
    ["avatar", avatarIcon],
  ] as const;
  const relevantBounds = await Promise.all(
    relevantHeaderElements.map(([name, locator]) => boundsFor(locator, name))
  );
  const [, titleBounds, , homeBounds, avatarBounds] = relevantBounds;
  const headerBounds = await boundsFor(header, "header");
  const headerBottom = headerBounds.y + headerBounds.height;
  const maximumVisibleChildBottom = Math.max(
    ...relevantBounds.map(({ y, height }) => y + height)
  );
  const titleLineCount = await paintedLineCount(headerTitle);
  const homeTitleOverlap = overlaps(homeBounds, titleBounds);
  const userLabelVisible = await userLabel.isVisible();
  const { viewportWidth, horizontalOverflow } = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    horizontalOverflow:
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      document.body.scrollWidth > document.body.clientWidth,
  }));

  const measurements = {
    viewportWidth,
    horizontalOverflow,
    header: {
      bounds: headerBounds,
      titleBounds,
      titleLineCount,
      homeBounds,
      homeTitleOverlap,
      avatarBounds,
      userLabelVisible,
      maximumVisibleChildBottom,
    },
  };

  const measurementsPath = testInfo.outputPath("mobile-layout-measurements.json");
  await fs.writeFile(measurementsPath, JSON.stringify(measurements, null, 2));
  await testInfo.attach("mobile-layout-measurements", {
    path: measurementsPath,
    contentType: "application/json",
  });

  const fullPageScreenshotPath = testInfo.outputPath("mobile-full-page.png");
  await page.screenshot({ path: fullPageScreenshotPath, fullPage: true });
  await testInfo.attach("mobile-full-page-screenshot", {
    path: fullPageScreenshotPath,
    contentType: "image/png",
  });

  const headerScreenshotPath = testInfo.outputPath("mobile-header.png");
  await page.screenshot({
    path: headerScreenshotPath,
    clip: {
      x: 0,
      y: 0,
      width: viewportWidth,
      height: Math.ceil(Math.max(headerBottom, maximumVisibleChildBottom) + 8),
    },
  });
  await testInfo.attach("mobile-header-screenshot", {
    path: headerScreenshotPath,
    contentType: "image/png",
  });

  expect(titleLineCount).toBe(1);
  expect(homeTitleOverlap).toBe(false);
  expect(maximumVisibleChildBottom).toBeLessThanOrEqual(
    headerBottom + SUBPIXEL_TOLERANCE
  );
  expect(userLabelVisible).toBe(false);
  expect(avatarBounds.x).toBeGreaterThanOrEqual(
    headerBounds.x - SUBPIXEL_TOLERANCE
  );
  expect(avatarBounds.x + avatarBounds.width).toBeLessThanOrEqual(
    headerBounds.x + headerBounds.width + SUBPIXEL_TOLERANCE
  );
  expect(avatarBounds.y).toBeGreaterThanOrEqual(
    headerBounds.y - SUBPIXEL_TOLERANCE
  );
  expect(avatarBounds.y + avatarBounds.height).toBeLessThanOrEqual(
    headerBottom + SUBPIXEL_TOLERANCE
  );
  expect(horizontalOverflow).toBe(false);
});
