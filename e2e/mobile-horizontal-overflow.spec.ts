import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

const MOBILE_PROJECT = "mobile-webkit-iphone";
const WIDTH_TOLERANCE = 1;

const cases = [
  {
    name: "narrowed layout with an internally scrollable block code widget",
    path: "/mobile-overflow-block-code",
    heading: "Mobile Overflow Block Code Fixture",
    rootSelectors: [".expressive-code", ".expressive-code pre"],
    focusSelector: ".expressive-code",
    expectsNestedScroll: true,
  },
  {
    name: "narrowed layout with unbreakable inline code",
    path: "/mobile-overflow-inline-code",
    heading: "Mobile Overflow Inline Code Fixture",
    rootSelectors: [".chapter code:not(pre code)", ".chapter"],
    focusSelector: ".chapter p:has(code)",
    expectsNestedScroll: false,
  },
] as const;

for (const fixture of cases) {
  test(
    `keeps the document viewport-width for ${fixture.name}`,
    async ({ page }, testInfo) => {
      await page.goto(fixture.path);
      await expect(
        page.getByRole("heading", { name: fixture.heading })
      ).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      const measurements = await page.evaluate((rootSelectors) => {
        const round = (value: number) => Math.round(value * 100) / 100;
        const describe = (element: Element | null) => {
          if (!element) {
            return null;
          }
          let selector = element.tagName.toLowerCase();
          if (element.id) {
            selector += `#${CSS.escape(element.id)}`;
          }
          if (element.classList.length) {
            selector += `.${Array.from(element.classList)
              .slice(0, 4)
              .map((name) => CSS.escape(name))
              .join(".")}`;
          }
          return selector;
        };
        const details = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const parent = element.parentElement;
          const parentStyle = parent && getComputedStyle(parent);
          return {
            selector: describe(element),
            parent: describe(parent),
            tag: element.tagName.toLowerCase(),
            id: element.id,
            classes: Array.from(element.classList),
            boundingBox: {
              left: round(rect.left),
              right: round(rect.right),
              width: round(rect.width),
              top: round(rect.top),
              height: round(rect.height),
            },
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            computed: {
              display: style.display,
              position: style.position,
              width: style.width,
              minWidth: style.minWidth,
              maxWidth: style.maxWidth,
              overflowX: style.overflowX,
              whiteSpace: style.whiteSpace,
              boxSizing: style.boxSizing,
              transform: style.transform,
            },
            parentLayout: parentStyle && {
              display: parentStyle.display,
              flex: parentStyle.flex,
              gridTemplateColumns: parentStyle.gridTemplateColumns,
              overflowX: parentStyle.overflowX,
            },
          };
        };
        const documentElement = document.documentElement;
        const body = document.body;
        const roots = rootSelectors
          .flatMap((selector) =>
            Array.from(document.querySelectorAll(selector))
          )
          .filter(
            (element, index, elements) => elements.indexOf(element) === index
          )
          .slice(0, 4)
          .map(details);

        return {
          viewportWidth: window.innerWidth,
          documentClientWidth: documentElement.clientWidth,
          documentScrollWidth: documentElement.scrollWidth,
          bodyClientWidth: body.clientWidth,
          bodyScrollWidth: body.scrollWidth,
          horizontalOverflow:
            documentElement.scrollWidth > documentElement.clientWidth + 1 ||
            body.scrollWidth > body.clientWidth + 1,
          rootOffenders: roots,
        };
      }, fixture.rootSelectors);

      if (testInfo.project.name === MOBILE_PROJECT) {
        const artifactPath = testInfo.outputPath(
          "mobile-horizontal-overflow.json"
        );
        await fs.writeFile(artifactPath, JSON.stringify(measurements, null, 2));
        await testInfo.attach("mobile-horizontal-overflow", {
          path: artifactPath,
          contentType: "application/json",
        });

        const fullPagePath = testInfo.outputPath("mobile-full-page.png");
        await page.screenshot({ path: fullPagePath, fullPage: true });
        await testInfo.attach("mobile-full-page-screenshot", {
          path: fullPagePath,
          contentType: "image/png",
        });

        const focus = page.locator(fixture.focusSelector).first();
        await expect(focus).toBeVisible();
        const focusPath = testInfo.outputPath("mobile-overflow-feature.png");
        await focus.screenshot({ path: focusPath });
        await testInfo.attach("mobile-overflow-feature-screenshot", {
          path: focusPath,
          contentType: "image/png",
        });

        if (fixture.expectsNestedScroll) {
          const nested = measurements.rootOffenders.find(
            ({ tag }) => tag === "pre"
          );
          expect(
            nested,
            "expected the code widget's pre element in diagnostics"
          ).toBeTruthy();
          expect(nested!.scrollWidth).toBeGreaterThan(nested!.clientWidth);
        }
      }

      expect(
        measurements.documentScrollWidth,
        "the page document must not scroll horizontally"
      ).toBeLessThanOrEqual(measurements.documentClientWidth + WIDTH_TOLERANCE);
      expect(
        measurements.bodyScrollWidth,
        "the page body must not scroll horizontally"
      ).toBeLessThanOrEqual(measurements.bodyClientWidth + WIDTH_TOLERANCE);
    }
  );
}
