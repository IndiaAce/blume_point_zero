import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Entity, Relationship, EntityType } from '../types';

interface ForceGraphProps {
  entities: Entity[];
  relationships: Relationship[];
  onNodeClick: (entity: Entity) => void;
}

const ForceGraph: React.FC<ForceGraphProps> = ({ entities, relationships, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || entities.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Clear previous graph
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .style("cursor", "grab");

    const g = svg.append("g");

    // Add Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 5]) 
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom)
       .on("dblclick.zoom", null); 

    // Process data for D3
    const nodes = entities.map(e => ({ ...e }));
    const links = relationships.map(r => ({ ...r }));

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30));

    // Define colors based on EntityType
    const colorScale = (type: EntityType) => {
      switch (type) {
        case EntityType.THREAT_ACTOR: return "#ef4444"; // Red
        case EntityType.MALWARE: return "#f97316"; // Orange
        case EntityType.IP_ADDRESS: return "#3b82f6"; // Blue
        case EntityType.DOMAIN: return "#06b6d4"; // Cyan
        case EntityType.CVE: return "#eab308"; // Yellow
        case EntityType.TTP: return "#a855f7"; // Purple
        case EntityType.REPORT: return "#ffffff"; // White for Reports
        default: return "#94a3b8"; // Gray
      }
    };

    const link = g.append("g")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d: any) => Math.sqrt(d.weight || 1));

    const node = g.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(d3.drag<SVGGElement, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      )
      .on("click", (event, d) => {
        event.stopPropagation();
        const original = entities.find(e => e.id === d.id);
        if (original) onNodeClick(original);
      });

    // Draw shapes based on type
    node.each(function(d: any) {
        const el = d3.select(this);
        if (d.type === EntityType.REPORT) {
            // Draw Square for Reports
            el.append("rect")
              .attr("width", 20)
              .attr("height", 20)
              .attr("x", -10)
              .attr("y", -10)
              .attr("fill", colorScale(d.type));
        } else {
            // Draw Circle for others
            el.append("circle")
              .attr("r", d.type === EntityType.THREAT_ACTOR ? 14 : 8)
              .attr("fill", colorScale(d.type));
        }
    });

    // Node Labels
    node.append("text")
      .text((d: any) => d.name.length > 20 ? d.name.substring(0,17) + "..." : d.name)
      .attr("x", 15)
      .attr("y", 4)
      .attr("fill", "#e2e8f0")
      .attr("stroke", "none")
      .attr("font-size", "10px")
      .attr("font-family", "monospace")
      .style("pointer-events", "none")
      .style("text-shadow", "2px 2px 4px #000");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
      svg.style("cursor", "grabbing");
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
      svg.style("cursor", "grab");
    }

    return () => {
      simulation.stop();
    };
  }, [entities, relationships, onNodeClick]);

  return (
    <div ref={containerRef} className="w-full h-full bg-cyber-dark overflow-hidden rounded-lg border border-gray-800 relative">
      <svg ref={svgRef} className="w-full h-full outline-none"></svg>
      {entities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
          <p>Ingest data to visualize the Threat Graph</p>
        </div>
      )}
    </div>
  );
};

export default ForceGraph;