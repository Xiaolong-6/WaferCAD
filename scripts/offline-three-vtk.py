#!/usr/bin/env python3
"""Read-only VTK rasterizer for WaferCAD native topology triangle payloads."""
import json
import sys
from pathlib import Path


def render(mesh_file, png_file, width, height, z_exaggeration):
    if width < 320 or width > 4096 or height < 320 or height > 4096:
        raise ValueError('Invalid viewport')
    if not (0 < z_exaggeration <= 1000):
        raise ValueError('Invalid Z exaggeration')
    try:
        import vtk
    except ImportError as exc:
        raise RuntimeError('VTK Python package not installed; use --mesh-only') from exc

    data = json.loads(Path(mesh_file).read_text(encoding='utf-8'))
    if data.get('schema') != 'wafercad-offline-3d-mesh-v1':
        raise ValueError('Unsupported mesh evidence schema')
    renderer = vtk.vtkRenderer()
    renderer.SetBackground(0.97, 0.98, 0.995)
    total = 0
    for layer in data['layers']:
        triangles = layer['triangles']
        if not triangles:
            continue
        points = vtk.vtkPoints()
        cells = vtk.vtkCellArray()
        for triangle in triangles:
            if len(triangle) != 3:
                raise ValueError('Malformed topology triangle')
            cell = vtk.vtkTriangle()
            for i, point in enumerate(triangle):
                if len(point) != 3:
                    raise ValueError('Malformed XYZ point')
                idx = points.InsertNextPoint(float(point[0]), float(point[1]), float(point[2]) * z_exaggeration)
                cell.GetPointIds().SetId(i, idx)
            cells.InsertNextCell(cell)
            total += 1
        poly = vtk.vtkPolyData()
        poly.SetPoints(points)
        poly.SetPolys(cells)
        normals = vtk.vtkPolyDataNormals()
        normals.SetInputData(poly)
        normals.ComputeCellNormalsOn()
        normals.SplittingOff()
        mapper = vtk.vtkPolyDataMapper()
        mapper.SetInputConnection(normals.GetOutputPort())
        actor = vtk.vtkActor()
        actor.SetMapper(mapper)
        value = layer['color'].lstrip('#')
        if len(value) != 6:
            raise ValueError('Invalid material color')
        actor.GetProperty().SetColor(*(int(value[i:i+2], 16) / 255 for i in (0, 2, 4)))
        actor.GetProperty().SetAmbient(0.25)
        actor.GetProperty().SetDiffuse(0.72)
        actor.GetProperty().SetSpecular(0.12)
        actor.GetProperty().SetSpecularPower(12)
        renderer.AddActor(actor)
    if total == 0:
        raise ValueError('No material triangles to draw')
    if data.get('borderLines'):
        border_points = vtk.vtkPoints()
        border_cells = vtk.vtkCellArray()
        for segment in data['borderLines']:
            if len(segment) != 2:
                raise ValueError('Malformed native border segment')
            line = vtk.vtkLine()
            for i, xyz in enumerate(segment):
                line.GetPointIds().SetId(i, border_points.InsertNextPoint(float(xyz[0]), float(xyz[1]), float(xyz[2]) * z_exaggeration))
            border_cells.InsertNextCell(line)
        border_poly = vtk.vtkPolyData()
        border_poly.SetPoints(border_points)
        border_poly.SetLines(border_cells)
        border_mapper = vtk.vtkPolyDataMapper()
        border_mapper.SetInputData(border_poly)
        border_actor = vtk.vtkActor()
        border_actor.SetMapper(border_mapper)
        border_actor.GetProperty().SetColor(0.25, 0.31, 0.38)
        border_actor.GetProperty().SetLineWidth(1)
        renderer.AddActor(border_actor)

    window = vtk.vtkRenderWindow()
    window.SetOffScreenRendering(1)
    window.SetSize(width, height)
    window.AddRenderer(renderer)
    cam = renderer.GetActiveCamera()
    cam.SetViewUp(0, 0, 1)
    renderer.ResetCamera()
    position = cam.GetPosition()
    focal = cam.GetFocalPoint()
    d = max(1.0, cam.GetDistance())
    cam.SetPosition(focal[0] + d * 0.8, focal[1] - d * 1.0, focal[2] + d * 0.65)
    cam.SetViewUp(0, 0, 1)
    cam.OrthogonalizeViewUp()
    cam.ParallelProjectionOn()
    renderer.ResetCamera()
    renderer.ResetCameraClippingRange()
    window.Render()
    snapshot = vtk.vtkWindowToImageFilter()
    snapshot.SetInput(window)
    snapshot.ReadFrontBufferOff()
    snapshot.Update()
    png = vtk.vtkPNGWriter()
    png.SetFileName(str(png_file))
    png.SetInputConnection(snapshot.GetOutputPort())
    png.Write()
    window.Finalize()
    return total


if __name__ == '__main__':
    if len(sys.argv) != 6:
        raise SystemExit('Usage: offline-three-vtk.py mesh.json output.png width height z-exaggeration')
    result = render(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5]))
    print(f'VTK offscreen triangles={result}')