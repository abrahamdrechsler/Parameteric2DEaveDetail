"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type StructureType = "rafter" | "raisedHeelTruss" | "cantileveredRaisedHeelTruss" | "commonTruss";

type Inputs = {
  seatCut: number;
  rafterDepth: number;
  heelHeight: number;
  topChordDepth: number;
  bottomChordDepth: number;
  fasciaHeight: number;
  pitch: number;
  overhang: number;
};

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
};

type ControlsPanelProps = {
  children: ReactNode;
};

const DEFAULTS: Inputs = {
  seatCut: 5.25,
  rafterDepth: 5.5,
  heelHeight: 13.75,
  topChordDepth: 5.5,
  bottomChordDepth: 3.5,
  fasciaHeight: 8,
  pitch: 6,
  overhang: 18,
};

const RED = "#e22b2b";
const INK = "#24211d";
const WOOD = "#e7d4b5";
const WOOD_LIGHT = "#f1e4ce";
const SHEATHING_THICKNESS = 0.6;
const FASCIA_STEP = 0.125;

function formatInches(value: number): string {
  return `${value.toFixed(2)}\u2033`;
}

function formatDelta(value: number): string {
  if (Math.abs(value) < 0.005) {
    return "0.00\u2033 aligned";
  }
  return `${formatInches(Math.abs(value))} ${value > 0 ? "above" : "below"}`;
}

function getMinimumFasciaHeight(memberDepth: number, pitch: number): number {
  const slopeLength = Math.sqrt(1 + (pitch / 12) ** 2);
  const plumbCutHeight = (memberDepth + SHEATHING_THICKNESS) * slopeLength;
  return Math.ceil(plumbCutHeight / FASCIA_STEP) * FASCIA_STEP;
}

function Slider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  return (
    <label className="control">
      <span className="control-heading">
        <span>{label}</span>
        <span className="control-value">
          <input
            aria-label={`${label} value`}
            inputMode="decimal"
            max={max}
            min={min}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (Number.isFinite(nextValue)) {
                onChange(Math.min(max, Math.max(min, nextValue)));
              }
            }}
            step={step}
            type="number"
            value={Number(value.toFixed(3))}
          />
          <span>{unit}</span>
        </span>
      </span>
      <input
        aria-label={label}
        className="slider"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="range-labels" aria-hidden="true"><span>{min}</span><span>{max}</span></span>
    </label>
  );
}

function ControlsPanel({ children }: ControlsPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const updateScale = (): void => {
      const panel = panelRef.current;
      const content = contentRef.current;
      if (panel === null || content === null) {
        return;
      }

      if (window.matchMedia("(max-width: 900px)").matches) {
        setScale(1);
        return;
      }

      const panelStyle = window.getComputedStyle(panel);
      const verticalPadding = Number.parseFloat(panelStyle.paddingTop) + Number.parseFloat(panelStyle.paddingBottom);
      const availableHeight = Math.max(1, panel.clientHeight - verticalPadding);
      const nextScale = Math.min(1, availableHeight / content.scrollHeight);
      setScale((currentScale) => Math.abs(currentScale - nextScale) < 0.002 ? currentScale : nextScale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (panelRef.current !== null) {
      observer.observe(panelRef.current);
    }
    if (contentRef.current !== null) {
      observer.observe(contentRef.current);
    }
    window.addEventListener("resize", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, []);

  return (
    <aside className="controls-panel" ref={panelRef}>
      <div
        className="controls-content"
        ref={contentRef}
        style={{ transform: `scale(${scale})`, width: `${100 / scale}%` }}
      >
        {children}
      </div>
    </aside>
  );
}

function line(context: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number) {
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
}

function polygon(context: CanvasRenderingContext2D, points: Array<[number, number]>, fill: string) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      context.moveTo(x, y);
      return;
    }
    context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = 1.4;
  context.stroke();
}

function drawArrow(context: CanvasRenderingContext2D, x: number, y: number, direction: number) {
  const size = 5;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + Math.cos(direction + 0.5) * size, y + Math.sin(direction + 0.5) * size);
  context.lineTo(x + Math.cos(direction - 0.5) * size, y + Math.sin(direction - 0.5) * size);
  context.closePath();
  context.fillStyle = RED;
  context.fill();
}

function EaveCanvas({ inputs, structureType }: { inputs: Inputs; structureType: StructureType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.lineCap = "round";
    context.lineJoin = "round";

    const isRafter = structureType === "rafter";
    const isRaisedHeelTruss = structureType === "raisedHeelTruss";
    const isCantileveredTruss = structureType === "cantileveredRaisedHeelTruss";
    const isCommonTruss = structureType === "commonTruss";
    const isTruss = !isRafter;
    const pitchRatio = inputs.pitch / 12;
    const slopeLength = Math.sqrt(1 + pitchRatio * pitchRatio);
    const memberDepth = isTruss ? inputs.topChordDepth : inputs.rafterDepth;
    const memberVerticalDepth = memberDepth * slopeLength;
    const sheathingDepth = SHEATHING_THICKNESS * slopeLength;
    const minimumFasciaHeight = getMinimumFasciaHeight(memberDepth, inputs.pitch);
    const fasciaHeight = Math.max(inputs.fasciaHeight, minimumFasciaHeight);
    const memberLeft = -inputs.overhang;
    // Frame the eave connection as a construction detail rather than showing a
    // long interior run of roof framing. The member continues beyond the crop.
    const worldRight = 44;
    const memberRight = worldRight + 6;
    const memberLowerAt = (x: number) => {
      if (isRaisedHeelTruss) {
        return inputs.heelHeight - memberVerticalDepth + pitchRatio * x;
      }
      if (isCantileveredTruss) {
        return pitchRatio * (x + inputs.overhang);
      }
      if (isCommonTruss) {
        return pitchRatio * x;
      }
      return pitchRatio * (x - inputs.seatCut);
    };
    const memberUpperAt = (x: number) => memberLowerAt(x) + memberVerticalDepth;
    const fasciaTop = memberUpperAt(memberLeft) + sheathingDepth;
    const fasciaBottom = fasciaTop - fasciaHeight;
    const soffitY = isCantileveredTruss ? 0 : fasciaBottom;
    const springWorldX = isCantileveredTruss ? memberLeft : isRafter ? inputs.seatCut : 0;
    const springWorldY = isRaisedHeelTruss ? memberUpperAt(0) : 0;

    // A fixed camera keeps T.O. plate and drawing scale stable while users
    // switch structural types or change parameters. Geometry may crop, but the
    // viewport never reframes itself around the result.
    const worldBottom = -32;
    const scale = Math.min(
      (bounds.width - 64) / 90,
      (bounds.height - 58) / 68,
    );
    const originX = bounds.width * 0.38;
    const originY = bounds.height * 0.58;
    const toCanvas = (x: number, y: number): [number, number] => [originX + x * scale, originY - y * scale];
    const drawWorldPolygon = (points: Array<[number, number]>, fill: string) => polygon(context, points.map(([x, y]) => toCanvas(x, y)), fill);

    const wallWidth = 3.5;
    const wallBottom = worldBottom - 6;
    const plateDepth = 1.5;
    drawWorldPolygon([[0, wallBottom], [wallWidth, wallBottom], [wallWidth, -plateDepth * 2], [0, -plateDepth * 2]], "#f7f2e9");
    drawWorldPolygon([[0, -plateDepth * 2], [wallWidth, -plateDepth * 2], [wallWidth, -plateDepth], [0, -plateDepth]], WOOD_LIGHT);
    drawWorldPolygon([[0, -plateDepth], [wallWidth, -plateDepth], [wallWidth, 0], [0, 0]], WOOD);

    if (isTruss) {
      const heelWebWidth = 6;
      const bottomChordLeft = isCantileveredTruss ? memberLeft : 0;
      drawWorldPolygon([[bottomChordLeft, 0], [memberRight, 0], [memberRight, inputs.bottomChordDepth], [bottomChordLeft, inputs.bottomChordDepth]], WOOD_LIGHT);
      if (!isCommonTruss) {
        const heelWebTopLeft = memberLowerAt(0);
        const heelWebTopRight = memberLowerAt(heelWebWidth);
        if (heelWebTopRight > inputs.bottomChordDepth) {
          const rawStartX = (inputs.bottomChordDepth - heelWebTopLeft) / pitchRatio;
          const heelWebStartX = Math.min(heelWebWidth, Math.max(0, rawStartX));
          drawWorldPolygon([
            [heelWebStartX, inputs.bottomChordDepth],
            [heelWebWidth, inputs.bottomChordDepth],
            [heelWebWidth, heelWebTopRight],
            [heelWebStartX, memberLowerAt(heelWebStartX)],
          ], WOOD_LIGHT);
        }
      }
      drawWorldPolygon([
        [memberLeft, memberLowerAt(memberLeft)],
        [memberRight, memberLowerAt(memberRight)],
        [memberRight, memberUpperAt(memberRight)],
        [memberLeft, memberUpperAt(memberLeft)],
      ], WOOD);
    } else {
      // The uncut rafter passes through the plate. The birdsmouth removes the
      // triangular material below the horizontal seat from one continuous member.
      drawWorldPolygon([
        [memberLeft, memberLowerAt(memberLeft)],
        [0, memberLowerAt(0)],
        [0, 0],
        [inputs.seatCut, 0],
        [memberRight, memberLowerAt(memberRight)],
        [memberRight, memberUpperAt(memberRight)],
        [memberLeft, memberUpperAt(memberLeft)],
      ], WOOD);
    }

    drawWorldPolygon([
      [memberLeft - 0.35, memberUpperAt(memberLeft)],
      [memberRight, memberUpperAt(memberRight)],
      [memberRight, memberUpperAt(memberRight) + sheathingDepth],
      [memberLeft - 0.35, memberUpperAt(memberLeft) + sheathingDepth],
    ], "#d7b98e");

    const fasciaWidth = 1.5;
    drawWorldPolygon([
      [memberLeft - fasciaWidth, fasciaBottom],
      [memberLeft, fasciaBottom],
      [memberLeft, fasciaTop],
      [memberLeft - fasciaWidth, fasciaTop],
    ], "#dbc39d");

    const soffitThickness = 0.35;
    drawWorldPolygon([
      [memberLeft, soffitY],
      [0, soffitY],
      [0, soffitY + soffitThickness],
      [memberLeft, soffitY + soffitThickness],
    ], "#eee7db");

    context.save();
    context.strokeStyle = "rgba(89, 65, 36, 0.2)";
    context.lineWidth = 0.65;
    for (let offset = 9; offset < worldRight; offset += 11) {
      const [x1, y1] = toCanvas(offset, memberLowerAt(offset) + 1.3);
      const [x2, y2] = toCanvas(offset + 7, memberLowerAt(offset + 7) + 1.7);
      line(context, x1, y1, x2, y2);
    }
    context.restore();

    const [outsideFaceX, outsideFaceY] = toCanvas(0, 0);
    const [springX, springY] = toCanvas(springWorldX, springWorldY);
    context.fillStyle = INK;
    context.beginPath();
    context.arc(outsideFaceX, outsideFaceY, 3.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = RED;
    context.lineWidth = 1;
    context.globalAlpha = 0.55;
    context.beginPath();
    context.arc(springX, springY, 56, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = RED;
    context.beginPath();
    context.arc(springX, springY, 4.5, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = RED;
    context.fillStyle = RED;
    context.lineWidth = 1;
    context.font = "500 12px monospace";

    const fasciaDimensionX = toCanvas(memberLeft - fasciaWidth - 3, 0)[0];
    const fasciaTopY = toCanvas(0, fasciaTop)[1];
    const fasciaBottomY = toCanvas(0, fasciaBottom)[1];
    line(context, fasciaDimensionX, fasciaTopY, fasciaDimensionX, fasciaBottomY);
    drawArrow(context, fasciaDimensionX, fasciaTopY, Math.PI / 2);
    drawArrow(context, fasciaDimensionX, fasciaBottomY, -Math.PI / 2);
    context.save();
    context.translate(fasciaDimensionX - 10, (fasciaTopY + fasciaBottomY) / 2);
    context.rotate(-Math.PI / 2);
    context.textAlign = "center";
    context.fillText(`${formatInches(fasciaHeight)} FASCIA`, 0, 0);
    context.restore();

    const dimensionWorldY = Math.max(-25, Math.min(-20, soffitY - 7));
    const dimensionY = toCanvas(0, dimensionWorldY)[1];
    const overhangStart = toCanvas(memberLeft, dimensionWorldY)[0];
    line(context, overhangStart, dimensionY, outsideFaceX, dimensionY);
    line(context, overhangStart, dimensionY - 8, overhangStart, dimensionY + 8);
    line(context, outsideFaceX, dimensionY - 8, outsideFaceX, dimensionY + 8);
    drawArrow(context, overhangStart, dimensionY, 0);
    drawArrow(context, outsideFaceX, dimensionY, Math.PI);
    context.textAlign = "center";
    context.fillText(`${formatInches(inputs.overhang)} OVERHANG`, (overhangStart + outsideFaceX) / 2, dimensionY - 8);

    const depthX = 24;
    const depthBase = memberLowerAt(depthX);
    const [depthStartX, depthStartY] = toCanvas(depthX, depthBase);
    const normalX = -pitchRatio / slopeLength;
    const normalY = 1 / slopeLength;
    const [depthEndX, depthEndY] = toCanvas(depthX + normalX * memberDepth, depthBase + normalY * memberDepth);
    const dimAngle = Math.atan2(-pitchRatio, 1) + Math.PI / 2;
    line(context, depthStartX, depthStartY, depthEndX, depthEndY);
    drawArrow(context, depthStartX, depthStartY, dimAngle + Math.PI);
    drawArrow(context, depthEndX, depthEndY, dimAngle);
    context.save();
    context.translate((depthStartX + depthEndX) / 2 + 15, (depthStartY + depthEndY) / 2);
    context.rotate(-Math.atan(pitchRatio) + Math.PI / 2);
    context.textAlign = "center";
    context.fillText(`${formatInches(memberDepth)} ${isTruss ? "TOP CHORD" : "RAFTER"} DEPTH`, 0, 0);
    context.restore();

    if (isTruss) {
      const heelDimensionX = toCanvas(11, 0)[0];
      const heelHeight = isRaisedHeelTruss ? inputs.heelHeight : memberUpperAt(0);
      const heelCanvasY = toCanvas(0, heelHeight)[1];
      line(context, heelDimensionX, outsideFaceY, heelDimensionX, heelCanvasY);
      drawArrow(context, heelDimensionX, outsideFaceY, -Math.PI / 2);
      drawArrow(context, heelDimensionX, heelCanvasY, Math.PI / 2);
      context.save();
      context.translate(heelDimensionX + 14, (outsideFaceY + heelCanvasY) / 2);
      context.rotate(Math.PI / 2);
      context.textAlign = "center";
      context.fillText(`${formatInches(heelHeight)} HEEL HEIGHT`, 0, 0);
      context.restore();
    } else if (isRafter) {
      line(context, outsideFaceX, outsideFaceY + 16, springX, springY + 16);
      drawArrow(context, outsideFaceX, outsideFaceY + 16, 0);
      drawArrow(context, springX, springY + 16, Math.PI);
      context.textAlign = "left";
      context.fillText(`${formatInches(inputs.seatCut)} SEAT CUT`, springX + 8, springY + 20);
    }

    const soffitDimensionWorldX = isTruss ? 29 : 14;
    const soffitDimensionX = toCanvas(soffitDimensionWorldX, 0)[0];
    const soffitCanvasY = toCanvas(soffitDimensionWorldX, soffitY)[1];
    line(context, soffitDimensionX, outsideFaceY, soffitDimensionX, soffitCanvasY);
    drawArrow(context, soffitDimensionX, outsideFaceY, soffitY >= 0 ? -Math.PI / 2 : Math.PI / 2);
    drawArrow(context, soffitDimensionX, soffitCanvasY, soffitY >= 0 ? Math.PI / 2 : -Math.PI / 2);
    context.save();
    context.translate(soffitDimensionX + 14, (outsideFaceY + soffitCanvasY) / 2);
    context.rotate(Math.PI / 2);
    context.textAlign = "center";
    context.fillText(`SOFFIT Δ ${formatInches(Math.abs(soffitY))}`, 0, 0);
    context.restore();

    context.strokeStyle = "rgba(226, 43, 43, 0.42)";
    context.setLineDash([7, 7]);
    const plateY = toCanvas(0, 0)[1];
    line(context, 20, plateY, bounds.width - 20, plateY);
    context.setLineDash([]);
    context.fillStyle = RED;
    context.font = "500 10px monospace";
    context.textAlign = "right";
    context.fillText("T.O. PLATE", bounds.width - 24, plateY - 8);

    context.fillStyle = "#6f6252";
    context.textAlign = "left";
    context.font = "500 10px monospace";
    const heelHeight = isRaisedHeelTruss ? inputs.heelHeight : isRafter ? memberVerticalDepth : memberUpperAt(0);
    context.fillText(`HEEL ${formatInches(heelHeight)}`, 24, 24);
    context.fillText(`SOFFIT ${formatDelta(soffitY)}`, 24, 40);
  }, [inputs, structureType]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    const canvas = canvasRef.current;
    if (canvas) {
      observer.observe(canvas);
    }
    return () => observer.disconnect();
  }, [draw]);

  const label = `Interactive two-dimensional ${structureType.replaceAll("Truss", " truss")} eave section`;

  return <canvas className="eave-canvas" ref={canvasRef} role="img" aria-label={label} />;
}

export default function Home() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const [structureType, setStructureType] = useState<StructureType>("rafter");
  const isRafter = structureType === "rafter";
  const isRaisedHeelTruss = structureType === "raisedHeelTruss";
  const isCantileveredTruss = structureType === "cantileveredRaisedHeelTruss";
  const isCommonTruss = structureType === "commonTruss";
  const isTruss = !isRafter;
  const update = (key: keyof Inputs, value: number) => setInputs((current) => ({ ...current, [key]: value }));
  const pitchRatio = inputs.pitch / 12;
  const memberDepth = isTruss ? inputs.topChordDepth : inputs.rafterDepth;
  const memberVerticalDepth = memberDepth * Math.sqrt(1 + pitchRatio ** 2);
  const sheathingVerticalDepth = SHEATHING_THICKNESS * Math.sqrt(1 + pitchRatio ** 2);
  const minimumFasciaHeight = getMinimumFasciaHeight(memberDepth, inputs.pitch);
  const fasciaHeight = Math.max(inputs.fasciaHeight, minimumFasciaHeight);
  useEffect(() => {
    setInputs((current) => {
      if (current.fasciaHeight >= minimumFasciaHeight) {
        return current;
      }
      return { ...current, fasciaHeight: minimumFasciaHeight };
    });
  }, [minimumFasciaHeight]);
  const memberLowerAtEave = (() => {
    if (isRaisedHeelTruss) {
      return inputs.heelHeight - memberVerticalDepth - pitchRatio * inputs.overhang;
    }
    if (isCantileveredTruss) {
      return 0;
    }
    if (isCommonTruss) {
      return -pitchRatio * inputs.overhang;
    }
    return -pitchRatio * (inputs.overhang + inputs.seatCut);
  })();
  const fasciaTopAtEave = memberLowerAtEave + memberVerticalDepth + sheathingVerticalDepth;
  const soffitDelta = isCantileveredTruss ? 0 : fasciaTopAtEave - fasciaHeight;
  const heelHeight = (() => {
    if (isRaisedHeelTruss) {
      return inputs.heelHeight;
    }
    if (isCantileveredTruss) {
      return pitchRatio * inputs.overhang + memberVerticalDepth;
    }
    if (isCommonTruss) {
      return memberVerticalDepth;
    }
    return memberVerticalDepth;
  })();
  const typeDetails = {
    rafter: {
      badge: "Rafter",
      title: "Rafter · birdsmouth bearing",
      instruction: "The birdsmouth is removed from one continuous rafter; its horizontal seat bears directly on the plate.",
      spring: "Seat endpoint",
      springRole: "Birdsmouth",
    },
    raisedHeelTruss: {
      badge: "Raised-heel truss",
      title: "Raised-heel truss · heel-height driven",
      instruction: "Heel height fixes the top-of-heel spring point; roof slope rotates the top chord around it.",
      spring: "T.O. heel",
      springRole: "Constraint",
    },
    cantileveredRaisedHeelTruss: {
      badge: "Cantilevered truss",
      title: "Cantilevered raised-heel truss · overhang driven",
      instruction: "The outside bottom-chord vertex is the spring point; overhang, top-chord depth, and slope drive the roof.",
      spring: "Outside bottom chord",
      springRole: "Constraint",
    },
    commonTruss: {
      badge: "Common truss",
      title: "Common truss · chord-depth driven",
      instruction: "The sloped top chord and horizontal bottom chord meet at one plate-bearing point; there is no raised heel web.",
      spring: "Shared chord bearing",
      springRole: "Resultant",
    },
  }[structureType];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">Constraint laboratory</p><h1>2D Eave Detail Lab</h1></div>
        <div className="type-badge"><span className="status-dot" />{typeDetails.badge}</div>
      </header>

      <section className="workspace">
        <div className="drawing-panel">
          <div className="panel-heading">
            <div><p className="kicker">Structural type</p><h2>{typeDetails.title}</h2></div>
            <p className="instruction">{typeDetails.instruction}</p>
          </div>
          <div className="canvas-frame"><EaveCanvas inputs={inputs} structureType={structureType} /></div>
          <div className="result-strip">
            <div><span>Heel height</span><strong>{formatInches(heelHeight)}</strong><small>{isRaisedHeelTruss ? "Constraint" : "Resultant"}</small></div>
            <div><span>B.O. soffit ↔ T.O. plate</span><strong>{formatDelta(soffitDelta)}</strong><small>Resultant</small></div>
            <div><span>Spring point</span><strong>{typeDetails.spring}</strong><small>{typeDetails.springRole}</small></div>
          </div>
        </div>

        <ControlsPanel>
          <div className="controls-heading">
            <div><p className="kicker">Authoring inputs</p><h2>{isRafter ? "Rafter constraints" : "Truss constraints"}</h2></div>
            <button type="button" onClick={() => setInputs(DEFAULTS)}>Reset</button>
          </div>

          <div className="structure-switch" role="group" aria-label="Structural type">
            <button className={isRafter ? "active" : ""} type="button" aria-pressed={isRafter} onClick={() => setStructureType("rafter")}>Rafter</button>
            <button className={isRaisedHeelTruss ? "active" : ""} type="button" aria-pressed={isRaisedHeelTruss} onClick={() => setStructureType("raisedHeelTruss")}>Raised heel</button>
            <button className={isCantileveredTruss ? "active" : ""} type="button" aria-pressed={isCantileveredTruss} onClick={() => setStructureType("cantileveredRaisedHeelTruss")}>Cantilevered</button>
            <button className={isCommonTruss ? "active" : ""} type="button" aria-pressed={isCommonTruss} onClick={() => setStructureType("commonTruss")}>Common truss</button>
          </div>

          <div className="control-section">
            <div className="section-label"><span>Constraints</span><span>Drive geometry</span></div>
            {isRaisedHeelTruss ? (
              <>
                <Slider label="Heel height" min={6} max={30} step={0.25} unit="in" value={inputs.heelHeight} onChange={(value) => update("heelHeight", value)} />
                <Slider label="Roof slope" min={2} max={14} step={0.25} unit=":12" value={inputs.pitch} onChange={(value) => update("pitch", value)} />
              </>
            ) : isCantileveredTruss ? (
              <>
                <Slider label="Overhang" min={6} max={36} step={0.5} unit="in" value={inputs.overhang} onChange={(value) => update("overhang", value)} />
                <Slider label="Top chord depth" min={3.5} max={11.875} step={0.125} unit="in" value={inputs.topChordDepth} onChange={(value) => update("topChordDepth", value)} />
                <Slider label="Roof slope" min={2} max={14} step={0.25} unit=":12" value={inputs.pitch} onChange={(value) => update("pitch", value)} />
              </>
            ) : isCommonTruss ? (
              <>
                <Slider label="Top chord depth" min={3.5} max={11.875} step={0.125} unit="in" value={inputs.topChordDepth} onChange={(value) => update("topChordDepth", value)} />
                <Slider label="Roof slope" min={2} max={14} step={0.25} unit=":12" value={inputs.pitch} onChange={(value) => update("pitch", value)} />
              </>
            ) : (
              <>
                <Slider label="Seat cut" min={0} max={9} step={0.125} unit="in" value={inputs.seatCut} onChange={(value) => update("seatCut", value)} />
                <Slider label="Rafter depth" min={3.5} max={11.875} step={0.125} unit="in" value={inputs.rafterDepth} onChange={(value) => update("rafterDepth", value)} />
                <Slider label="Roof slope" min={2} max={14} step={0.25} unit=":12" value={inputs.pitch} onChange={(value) => update("pitch", value)} />
              </>
            )}
          </div>

          <div className="control-section independent">
            <div className="section-label"><span>Independent</span><span>Does not move spring point</span></div>
            {!isCantileveredTruss ? <Slider label="Overhang" min={6} max={36} step={0.5} unit="in" value={inputs.overhang} onChange={(value) => update("overhang", value)} /> : null}
            {isRaisedHeelTruss ? (
              <>
                <Slider label="Top chord depth" min={3.5} max={11.875} step={0.125} unit="in" value={inputs.topChordDepth} onChange={(value) => update("topChordDepth", value)} />
                <Slider label="Bottom chord depth" min={1.5} max={7.25} step={0.125} unit="in" value={inputs.bottomChordDepth} onChange={(value) => update("bottomChordDepth", value)} />
              </>
            ) : isTruss ? <Slider label="Bottom chord depth" min={1.5} max={7.25} step={0.125} unit="in" value={inputs.bottomChordDepth} onChange={(value) => update("bottomChordDepth", value)} /> : null}
          </div>

          <div className="control-section">
            <div className="section-label"><span>Fascia</span><span>Minimum {formatInches(minimumFasciaHeight)}</span></div>
            <Slider label="Fascia board height" min={minimumFasciaHeight} max={24} step={FASCIA_STEP} unit="in" value={fasciaHeight} onChange={(value) => update("fasciaHeight", value)} />
          </div>

          <div className="solver-note"><span className="note-icon">i</span><p><strong>Mutually exclusive type</strong> Each selection replaces the active constraint graph. Inputs appear only where the technical guideline assigns them as constraints or independent values.</p></div>
        </ControlsPanel>
      </section>

      <footer>
        <span>Browser-only prototype · no data is saved</span>
        <a href="https://app.notion.com/p/3091bc0298ce40bcb1926a380fd72062" target="_blank" rel="noreferrer">Technical design source ↗</a>
      </footer>
    </main>
  );
}
