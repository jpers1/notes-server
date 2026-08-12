import fs from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";

const BOOK_PATH = "/mobile-baseline";
const MOBILE_PROJECT = "mobile-webkit-iphone";
const SUBPIXEL_TOLERANCE = 1;
const SIDE_IMAGE_ALT = "Synthetic side image regression fixture";
const SIDE_IMAGE_CAPTION = "Side image test fixture.";
const SIDE_IMAGE_CHILDREN =
  "This repository-owned image exists only to verify side-image rendering.";
const FOLLOWING_CONTENT =
  "The side image should remain visible alongside this ordinary chapter content.";
const GEOMETRY_TOLERANCE = 1;

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

test("renders side images on narrow screens", async ({ page }, testInfo) => {
  await page.goto(BOOK_PATH);

  const sideImage = page
    .locator(".expanding-side-img")
    .getByRole("img", { name: SIDE_IMAGE_ALT });
  const wrapper = sideImage.locator("..");
  const container = wrapper.locator("..");
  const caption = wrapper.getByText(SIDE_IMAGE_CAPTION, { exact: true });
  const children = wrapper.getByText(SIDE_IMAGE_CHILDREN, { exact: true });
  const followingContent = page.getByText(FOLLOWING_CONTENT, { exact: true });

  await expect(container).toBeAttached();
  await expect(wrapper).toBeAttached();
  await expect(sideImage).toBeAttached();
  await expect(sideImage).toHaveJSProperty("complete", true);
  await container.scrollIntoViewIfNeeded();

  const [containerBox, wrapperBox, imageBox, followingContentBox] =
    await Promise.all([
      container.boundingBox(),
      wrapper.boundingBox(),
      sideImage.boundingBox(),
      followingContent.boundingBox(),
    ]);
  const withEdges = (
    box: { x: number; y: number; width: number; height: number } | null
  ) =>
    box && {
      ...box,
      top: box.y,
      right: box.x + box.width,
      bottom: box.y + box.height,
      left: box.x,
    };
  const containerBounds = withEdges(containerBox);
  const wrapperBounds = withEdges(wrapperBox);
  const imageBounds = withEdges(imageBox);
  const followingContentBounds = withEdges(followingContentBox);
  const elementDetails = await sideImage.evaluate((img: HTMLImageElement) => {
    const wrapperStyle = getComputedStyle(img.parentElement!);
    const imageStyle = getComputedStyle(img);
    const documentElement = document.documentElement;
    const body = document.body;

    return {
      wrapper: {
        position: wrapperStyle.position,
        transform: wrapperStyle.transform,
      },
      image: {
        position: imageStyle.position,
        transform: imageStyle.transform,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        src: img.currentSrc || img.src,
      },
      horizontalOverflow:
        documentElement.scrollWidth > documentElement.clientWidth ||
        body.scrollWidth > body.clientWidth,
    };
  });
  const viewport = page.viewportSize()!;
  const visibility = {
    image: await sideImage.isVisible(),
    caption: await caption.isVisible(),
    children: await children.isVisible(),
    followingContent: await followingContent.isVisible(),
  };
  const intersectsViewport = Boolean(
    imageBounds &&
      imageBounds.width > 0 &&
      imageBounds.height > 0 &&
      imageBounds.x + imageBounds.width > 0 &&
      imageBounds.y + imageBounds.height > 0 &&
      imageBounds.x < viewport.width &&
      imageBounds.y < viewport.height
  );
  const diagnostics = {
    viewport,
    containerBounds,
    wrapper: { bounds: wrapperBounds, ...elementDetails.wrapper },
    img: { bounds: imageBounds, ...elementDetails.image },
    followingContentBounds,
    intersectsViewport,
    horizontalOverflow: elementDetails.horizontalOverflow,
    visibility,
  };

  const artifactPrefix =
    testInfo.project.name === MOBILE_PROJECT ? "mobile" : "desktop";
  const diagnosticsPath = testInfo.outputPath(
    `${artifactPrefix}-side-image-diagnostics.json`
  );
  await fs.writeFile(
    diagnosticsPath,
    JSON.stringify(diagnostics, null, 2)
  );
  await testInfo.attach(`${artifactPrefix}-side-image-diagnostics`, {
    path: diagnosticsPath,
    contentType: "application/json",
  });

  const fullPagePath = testInfo.outputPath(
    `${artifactPrefix}-side-image-full-page.png`
  );
  await page.screenshot({ path: fullPagePath, fullPage: true });
  await testInfo.attach(`${artifactPrefix}-side-image-full-page`, {
    path: fullPagePath,
    contentType: "image/png",
  });

  await page
    .getByRole("heading", { name: "Side image fixture" })
    .scrollIntoViewIfNeeded();
  const regionPath = testInfo.outputPath(
    `${artifactPrefix}-side-image-region.png`
  );
  await page.screenshot({ path: regionPath });
  await testInfo.attach(`${artifactPrefix}-side-image-region`, {
    path: regionPath,
    contentType: "image/png",
  });

  expect(
    diagnostics.img.naturalWidth,
    "Expected the side-image asset to load"
  ).toBeGreaterThan(0);
  expect(diagnostics.img.naturalHeight).toBeGreaterThan(0);
  expect(diagnostics.wrapper.bounds?.width ?? 0).toBeGreaterThan(0);
  expect(diagnostics.wrapper.bounds?.height ?? 0).toBeGreaterThan(0);
  expect(diagnostics.img.bounds.width).toBeGreaterThan(0);
  expect(diagnostics.img.bounds.height).toBeGreaterThan(0);
  await expect(
    sideImage,
    "Expected the side image to be visible on mobile and desktop"
  ).toBeVisible();

  if (testInfo.project.name !== MOBILE_PROJECT) {
    expect(
      diagnostics.wrapper.bounds!.right,
      "Expected the desktop image to remain in the side column"
    ).toBeLessThanOrEqual(
      diagnostics.containerBounds!.left + GEOMETRY_TOLERANCE
    );
    expect(diagnostics.wrapper.bounds!.width).toBeLessThan(
      diagnostics.containerBounds!.width
    );
    return;
  }

  await expect(caption).toBeVisible();
  await expect(children).toBeVisible();
  await expect(followingContent).toBeVisible();
  expect(diagnostics.intersectsViewport).toBe(true);
  expect(diagnostics.wrapper.bounds!.left).toBeGreaterThanOrEqual(
    -GEOMETRY_TOLERANCE
  );
  expect(diagnostics.wrapper.bounds!.right).toBeLessThanOrEqual(
    diagnostics.viewport.width + GEOMETRY_TOLERANCE
  );
  expect(diagnostics.wrapper.bounds!.left).toBeGreaterThanOrEqual(
    diagnostics.containerBounds!.left - GEOMETRY_TOLERANCE
  );
  expect(diagnostics.wrapper.bounds!.right).toBeLessThanOrEqual(
    diagnostics.containerBounds!.right + GEOMETRY_TOLERANCE
  );
  expect(diagnostics.img.bounds.left).toBeGreaterThanOrEqual(
    diagnostics.wrapper.bounds!.left - GEOMETRY_TOLERANCE
  );
  expect(diagnostics.img.bounds.right).toBeLessThanOrEqual(
    diagnostics.wrapper.bounds!.right + GEOMETRY_TOLERANCE
  );
  expect(
    diagnostics.followingContentBounds!.top,
    "Expected following content to start below the inline side image"
  ).toBeGreaterThanOrEqual(
    diagnostics.wrapper.bounds!.bottom - GEOMETRY_TOLERANCE
  );
  expect(diagnostics.horizontalOverflow).toBe(false);
});
