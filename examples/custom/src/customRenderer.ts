import type { RenderFunctionInput } from "astro-takumi";
import React from "react";

const outerStyle: React.CSSProperties = {
  height: "100%",
  width: "100%",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  backgroundImage: "linear-gradient(to right, #24243e, #302b63, #0f0c29)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  height: "100%",
};

const contentStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  width: "100%",
  height: "100%",
  padding: "5rem",
};

const headingStyle: React.CSSProperties = {
  fontSize: "60px",
  color: "white",
  fontWeight: 700,
  textAlign: "left",
};

export function customOgMediaLayout({ title }: RenderFunctionInput): Promise<React.ReactNode> {
  return Promise.resolve(
    React.createElement(
      "div",
      { style: outerStyle },
      React.createElement(
        "div",
        { style: rowStyle },
        React.createElement("div", { style: contentStyle }, React.createElement("h1", { style: headingStyle }, title)),
      ),
    ),
  );
}
