// src/engine/three-mesh-bvh-setup.ts
import { Mesh } from "three";
import { BufferGeometry } from "three";
import {
    acceleratedRaycast,
    computeBoundsTree,
    disposeBoundsTree,
} from "three-mesh-bvh";

// add the methods to three prototypes (TS will understand with the lib's d.ts)
(BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(Mesh.prototype as any).raycast = acceleratedRaycast;
