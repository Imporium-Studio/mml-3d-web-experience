import { BufferAttribute, BufferGeometry, Material, SkinnedMesh } from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

function logGeomAttributes(geom: BufferGeometry, label = 'geom') {
  console.group(`ATTRS ${label}`);
  for (const [name, attr] of Object.entries(geom.attributes)) {
    const a = attr as BufferAttribute;
    const ctor = (a.array as ArrayLike<any>).constructor?.name;
    console.log(
      name.padEnd(14),
      'type:', ctor?.padEnd(12),
      'itemSize:', a.itemSize,
      'normalized:', a.normalized
    );
  }
  console.groupEnd();
}

export function mergeSkinnedMeshes(skinnedMeshes: SkinnedMesh[], debug?: boolean): SkinnedMesh {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const skeleton = skinnedMeshes[0].skeleton;

  console.log("mergeSkinnedMeshes called with meshes:", skinnedMeshes);

  for (const skinnedMesh of skinnedMeshes) {
    const geometry = skinnedMesh.geometry.clone();

    const materialIndex = materials.length;
    if (Array.isArray(skinnedMesh.material)) {
      materials.push(...skinnedMesh.material);
      for (let i = 0; i < skinnedMesh.material.length; i++) {
        geometry.addGroup(
          0,
          geometry.index ? geometry.index.count : geometry.attributes.position.count,
          materialIndex + i,
        );
      }
    } else {
      materials.push(skinnedMesh.material);
      geometry.addGroup(
        0,
        geometry.index ? geometry.index.count : geometry.attributes.position.count,
        materialIndex,
      );
    }

    geometries.push(geometry);
  }

  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, true);
  if (!mergedGeometry) throw new Error("Failed to merge geometries");
  logGeomAttributes(mergedGeometry, 'after-merge');

  // 2) Ensure index is large enough (avoid 16-bit overflow if > 65k verts)
  const posCount = mergedGeometry.attributes.position.count;
  if (!mergedGeometry.index) {
    // build a trivial index so BVH can operate
    const idx = new Uint32Array(posCount);
    for (let i = 0; i < posCount; i++) idx[i] = i;
    mergedGeometry.setIndex(new BufferAttribute(idx, 1));
  } else if (
    !(mergedGeometry.getIndex()!.array instanceof Uint32Array) &&
    posCount > 65535
  ) {
    // upcast to 32-bit
    mergedGeometry.setIndex(
      new BufferAttribute(new Uint32Array(mergedGeometry.getIndex()!.array as any), 1),
    );
  }

  // 3) Recompute normals after weld/merge (safe default)
  mergedGeometry.computeVertexNormals();

  // 4) Build BVH once (fast raycast, spatial queries)
  (mergedGeometry as any).computeBoundsTree?.();

  const mergedMesh = new SkinnedMesh(mergedGeometry, materials);
  mergedMesh.skeleton = skeleton;
  mergedMesh.bindMatrix.copy(skinnedMeshes[0].bindMatrix);
  mergedMesh.bindMatrixInverse.copy(skinnedMeshes[0].bindMatrixInverse);
  mergedMesh.bind(skeleton, mergedMesh.bindMatrix);

  if (debug) {
    console.log(`Merged into single mesh with ${materials.length} materials`);
  }

  console.log("Merged mesh:", mergedMesh);

  addVertexColorsToGeometry(mergedGeometry, materials, debug);

  return mergedMesh;
}

export function validateAndCleanSkeleton(skinnedMesh: SkinnedMesh): void {
  const skeleton = skinnedMesh.skeleton;
  const nullBoneIndices: number[] = [];
  for (let i = 0; i < skeleton.bones.length; i++) {
    if (!skeleton.bones[i]) {
      nullBoneIndices.push(i);
    }
  }
  if (nullBoneIndices.length > 0) {
    skeleton.bones = skeleton.bones.filter((bone) => bone !== null && bone !== undefined);
    skeleton.update();
  }
}

function addVertexColorsToGeometry(
  geometry: BufferGeometry,
  materials: Material[],
  debug?: boolean,
): void {
  const positionAttribute = geometry.getAttribute("position");

  if (!positionAttribute) {
    console.error("No position attribute found in geometry");
    return;
  }

  const vertexCount = positionAttribute.count;
  if (debug) {
    console.log(`Geometry has ${vertexCount} vertices`);
  }

  const colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = 1.0; // R
    colors[i * 3 + 1] = 1.0; // G
    colors[i * 3 + 2] = 1.0; // B
  }

  const materialColorCodes = {
    // bin material IDs to be replaced by the final colors on the GPU
    hair: [0.0, 0.0, 0.0],
    shirt_short: [0.0, 0.0, 1.0],
    shirt_long: [0.0, 1.0, 0.0],
    pants_short: [0.0, 1.0, 1.0],
    pants_long: [1.0, 0.0, 0.0],
    shoes: [1.0, 0.0, 1.0],
    skin: [1.0, 1.0, 0.0],
    lips: [1.0, 1.0, 1.0],
    eyes_black: [0.5, 0.0, 0.0],
    eyes_white: [0.0, 0.5, 0.0],
  };

  if (debug) {
    console.log("Geometry groups:", geometry.groups);
    console.log(
      "Materials:",
      materials.map((m: any) => m.name),
    );
  }

  // apply colors based on groups
  if (geometry.groups && geometry.groups.length > 0) {
    geometry.groups.forEach((group, groupIndex) => {
      const material = materials[group.materialIndex || groupIndex];
      const materialName = material?.name || `material_${groupIndex}`;

      if (debug) {
        console.log(
          `Processing group ${groupIndex}: material "${materialName}", start: ${group.start}, count: ${group.count}`,
        );
      }

      const materialColor = materialColorCodes[materialName as keyof typeof materialColorCodes] || [
        1.0, 1.0, 1.0,
      ];
      if (debug) {
        console.log(
          `Using ID color [${materialColor.join(", ")}] for material "${materialName}" (${materialColor[0] === 1.0 && materialColor[1] === 1.0 && materialColor[2] === 0.0 ? "YELLOW=SKIN" : materialColor[0] === 0.0 && materialColor[1] === 0.0 && materialColor[2] === 1.0 ? "BLUE=SHIRT" : "OTHER"})`,
        );
      }

      const indexAttribute = geometry.getIndex();
      if (indexAttribute) {
        for (let i = group.start; i < group.start + group.count; i++) {
          const vertexIndex = indexAttribute.getX(i);
          colors[vertexIndex * 3] = materialColor[0];
          colors[vertexIndex * 3 + 1] = materialColor[1];
          colors[vertexIndex * 3 + 2] = materialColor[2];
        }
      } else {
        const startVertex = group.start / 3;
        const vertexCount = group.count / 3;
        for (let i = 0; i < vertexCount; i++) {
          const vertexIndex = startVertex + i;
          colors[vertexIndex * 3] = materialColor[0];
          colors[vertexIndex * 3 + 1] = materialColor[1];
          colors[vertexIndex * 3 + 2] = materialColor[2];
        }
      }
    });
  } else {
    console.warn("No geometry groups found, using single material coloring");
  }

  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  if (debug) {
    console.log(`Added per-material vertex colors to ${vertexCount} vertices`);
  }
}
