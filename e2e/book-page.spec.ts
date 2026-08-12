import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

const BOOK_PATH = "/mobile-baseline";
const MOBILE_PROJECT = "mobile-webkit-iphone";
const SIDE_IMAGE_ALT = "Synthetic side image regression fixture";
const SIDE_IMAGE_CAPTION = "Side image test fixture.";
const SIDE_IMAGE_CHILDREN =
  "This repository-owned image exists only to verify side-image rendering.";
const FOLLOWING_CONTENT =
  "The side image should remain visible alongside this ordinary chapter content.";
const GEOMETRY_TOLERANCE = 1;

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

  if (testInfo.project.name !== MOBILE_PROJECT) {
    return;
  }

  const measurements = await page.evaluate(() => {
    const boundsFor = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect && {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
      };
    };
    const documentElement = document.documentElement;
    const body = document.body;

    return {
      documentElement: {
        clientWidth: documentElement.clientWidth,
        scrollWidth: documentElement.scrollWidth,
      },
      body: {
        clientWidth: body.clientWidth,
        scrollWidth: body.scrollWidth,
      },
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      horizontalOverflow:
        documentElement.scrollWidth > documentElement.clientWidth ||
        body.scrollWidth > body.clientWidth,
      bounds: {
        main: boundsFor("main"),
        book: boundsFor(".book"),
      },
    };
  });

  const measurementsPath = testInfo.outputPath("mobile-layout-measurements.json");
  await fs.writeFile(measurementsPath, JSON.stringify(measurements, null, 2));
  await testInfo.attach("mobile-layout-measurements", {
    path: measurementsPath,
    contentType: "application/json",
  });

  const screenshotPath = testInfo.outputPath("mobile-full-page.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("mobile-full-page-screenshot", {
    path: screenshotPath,
    contentType: "image/png",
  });
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
