"""Create an editable 2.5D paper-theatre stage and genuinely skinned portraits.
Run with Blender --background --python blender/build_assets.py. Never opens or
overwrites a user's foreground project. Illustration textures remain independent.
"""
import bpy, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(exist_ok=True, parents=True)

def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

def material(name, path, transparent=False):
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    nodes=mat.node_tree.nodes; nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial')
    principled=nodes.new('ShaderNodeBsdfPrincipled')
    tex=nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(path), check_existing=True)
    mat.node_tree.links.new(tex.outputs['Color'],principled.inputs['Base Color'])
    mat.node_tree.links.new(tex.outputs['Color'],principled.inputs['Emission Color'])
    principled.inputs['Emission Strength'].default_value=1
    principled.inputs['Roughness'].default_value=1
    principled.inputs['Specular IOR Level'].default_value=0
    if transparent:
        mat.node_tree.links.new(tex.outputs['Alpha'],principled.inputs['Alpha'])
        mat.surface_render_method='DITHERED'
    mat.node_tree.links.new(principled.outputs['BSDF'],output.inputs['Surface'])
    return mat

def plane(name, width, height, depth, bottom, mat, segments=1):
    verts=[]; faces=[]
    cols=segments; rows=segments*2
    for row in range(rows+1):
        for col in range(cols+1):
            verts.append(((col/cols-.5)*width,depth,bottom+row/rows*height))
    for row in range(rows):
        for col in range(cols):
            i=row*(cols+1)+col
            faces.append((i,i+1,i+cols+2,i+cols+1))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    uv=mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for loop_i in poly.loop_indices:
            v=verts[mesh.loops[loop_i].vertex_index]
            uv.data[loop_i].uv=(v[0]/width+.5,(v[2]-bottom)/height)
    obj.data.materials.append(mat)
    return obj

def export(path, animation=False):
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
        export_yup=True, export_animations=animation,
        export_animation_mode='NLA_TRACKS', export_nla_strips=True,
        export_force_sampling=True, export_frame_range=False)

def solid(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.95
    return m
def cube(name,loc,scale,mat,bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    if bevel:mod=o.modifiers.new('Soft hand-made edges','BEVEL');mod.width=bevel;mod.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o
def arch(name,cx,depth,bottom,width,height,mat):
    radius=width/2;spring=bottom+height-radius
    verts=[(cx-radius,depth,bottom),(cx+radius,depth,bottom),(cx+radius,depth,spring)]
    for i in range(1,33):
        theta=i/32*math.pi;verts.append((cx+math.cos(theta)*radius,depth,spring+math.sin(theta)*radius))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[tuple(range(len(verts)))]);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat)

reset()
white=solid('White matte cloth',(.96,.96,.95));
linen=white.node_tree.nodes.new('ShaderNodeTexImage');linen.image=bpy.data.images.load(str(ROOT/'public/art/white-linen.webp'))
coords=white.node_tree.nodes.new('ShaderNodeTexCoord');scale=white.node_tree.nodes.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=32
white.node_tree.links.new(coords.outputs['UV'],linen.inputs['Vector']);white.node_tree.links.new(linen.outputs['Color'],white.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
backdrop=solid('White studio cyclorama',(1,1,1))
cube('White studio wall',(0,4,4),(50,.2,20),backdrop,0)
cube('White studio floor',(0,0,-1),(50,40,.2),backdrop,0)
cube('Table beneath cloth',(0,-.7,1.3),(28,2.3,.2),white,.06)
# A continuous white cloth: a quiet flat top and softly folded front drape.
cube('White linen tabletop',(0,-.7,1.415),(28,2.38,.055),white,.025)
verts=[];faces=[];cols=280;rows=30
for r in range(rows+1):
    t=r/rows
    for c in range(cols+1):
        x=(c/cols-.5)*28
        fold=(math.sin(x*5.3)+.4*math.sin(x*9.7))*.035*t
        verts.append((x,-1.91-fold,1.43-t*2.3+.02*math.cos(x*3)*t))
for r in range(rows):
    for c in range(cols):
        i=r*(cols+1)+c;faces.append((i,i+1,i+cols+2,i+cols+1))
mesh=bpy.data.meshes.new('Soft white linen folds');mesh.from_pydata(verts,[],faces);mesh.update()
uv=mesh.uv_layers.new(name='Linen UV')
for poly in mesh.polygons:
    for loop in poly.loop_indices:
        v=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(v.x/2,v.z/2)
cloth=bpy.data.objects.new('White tablecloth drape',mesh);bpy.context.collection.objects.link(cloth);mesh.materials.append(white)
for poly in mesh.polygons:poly.use_smooth=True
bpy.ops.object.camera_add(location=(0,-14,5.3))
cam=bpy.context.object;cam.name='FrontSalonCamera';cam.data.type='ORTHO';cam.data.ortho_scale=14
from mathutils import Vector
cam.rotation_euler=(Vector((0,0,2.6))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=cam
bpy.context.scene['art_direction']='White studio and white linen tablecloth with independently skinned toy-style 2.5D characters'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/salon-stage.blend'))
bpy.data.objects.remove(cam,do_unlink=True)
export(OUT/'salon.glb')

for name in ['monet','vincent','dali','georgia','lin']:
    reset()
    mat=material(name+' painted cutout',ROOT/f'public/art/{name}.webp',True)
    image=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE')
    mesh=plane(name+'_PortraitSkin',4*image.size[0]/image.size[1],4,0,0,mat,segments=24)
    arm=bpy.data.armatures.new(name+'_Rig'); rig=bpy.data.objects.new(name+'_Rig',arm)
    bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig
    rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    for bname,head,tail,parent in [
        ('Root',(0,0,0),(0,0,.4),None),
        ('Torso',(0,0,.4),(0,0,2.6),'Root'),
        ('Head',(0,0,2.6),(0,0,3.8),'Torso'),
        ('Gesture',(.3,0,1.1),(.6,0,2.2),'Torso')]:
        bone=arm.edit_bones.new(bname); bone.head=head; bone.tail=tail
        if parent: bone.parent=arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    groups={n:mesh.vertex_groups.new(name=n) for n in ['Root','Torso','Head','Gesture']}
    for v in mesh.data.vertices:
        x,y,z=v.co
        head=max(0,min(1,(z-2.45)/.55))
        root=max(0,min(.6,(.8-z)/1.2))
        hand=max(0,1-abs(z-1.6)/.65)*max(0,min(1,(x-.12)/.5))*.7
        hand*=1-head
        torso=max(0,1-head-root-hand)
        vals={'Root':root,'Torso':torso,'Head':head,'Gesture':hand}
        total=sum(vals.values())
        for n,w in vals.items():
            if w>0:groups[n].add([v.index],w/total,'REPLACE')
    mod=mesh.modifiers.new('Portrait armature deformation','ARMATURE'); mod.object=rig
    mesh.parent=rig
    bpy.context.scene.render.fps=24
    for clip in ['Idle','Talk','Curious','Excited','Upset']:
        rig.animation_data_create()
        rig.animation_data.action=None
        for pb in rig.pose.bones:
            pb.rotation_mode='XYZ'; pb.rotation_euler=(0,0,0); pb.location=(0,0,0)
        for frame in [1,13,25,37,49]:
            t=(frame-1)/48*math.tau
            spine=rig.pose.bones['Torso']; head=rig.pose.bones['Head']; hand=rig.pose.bones['Gesture']
            spine.rotation_euler=(0,.007*math.sin(t),0)
            head.rotation_euler=(0,.012*math.sin(t),0)
            hand.rotation_euler=(0,0,0)
            if clip=='Talk':
                head.rotation_euler[1]=.025*math.sin(t);hand.rotation_euler[1]=.045*math.sin(t)
            elif clip=='Curious':
                spine.rotation_euler[1]=-.025+.006*math.sin(t);head.rotation_euler[1]=.045
            elif clip=='Excited':
                spine.rotation_euler[1]=.025*math.sin(t);hand.rotation_euler[1]=-.10+.03*math.sin(t)
            elif clip=='Upset':
                spine.location[1]=.08;head.rotation_euler[1]=-.055+.005*math.sin(t)
            for pb in [spine,head,hand]:
                pb.keyframe_insert('rotation_euler',frame=frame,group=pb.name)
                pb.keyframe_insert('location',frame=frame,group=pb.name)
        action=rig.animation_data.action;action.name=clip
        track=rig.animation_data.nla_tracks.new(); track.name=clip
        track.strips.new(clip,1,action); track.mute=True
        rig.animation_data.action=None
    bpy.context.scene['representation']='Skinned 2.5D portrait, four bones, blended vertex weights. Not a volumetric character.'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'blender/{name}-rigged.blend'))
    export(OUT/f'{name}.glb',True)
print('AFTERGLOW_ASSETS_COMPLETE')
