from pathlib import Path
import numpy as np, subprocess
from PIL import Image, ImageDraw, ImageFilter
root=Path(__file__).resolve().parent
w,h,fps,n=640,360,10,60
p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{w}x{h}','-framerate',str(fps),'-i','-','-c:v','libx264','-preset','fast','-crf','12','-pix_fmt','yuv420p','-movflags','+faststart',str(root/'timing_6s_10fps.mp4')],stdin=subprocess.PIPE)
for i in range(n):
    y,x=np.mgrid[:h,:w]
    arr=np.uint8(np.where(((x//12+y//12)%2)[...,None],np.array([210,160,95]),np.array([35,75,115]))+np.zeros((h,w,3)))
    im=Image.fromarray(arr)
    if 20 <= i < 40: im=im.filter(ImageFilter.GaussianBlur(3))
    d=ImageDraw.Draw(im)
    d.rectangle((0,0,w,55),fill=(128,128,128))
    for b in range(6):
        d.rectangle((10+40*b,10,39+40*b,39),fill=(235,235,235) if (i>>b)&1 else (16,16,16))
    d.text((270,17),f'FRAME {i:02d}  t={i/fps:.1f}s',fill=(255,255,255))
    p.stdin.write(im.tobytes())
p.stdin.close(); assert p.wait()==0
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=25:duration=0.08','-c:v','libx264','-pix_fmt','yuv420p',str(root/'short_80ms.mp4')],check=True)
(root/'invalid.mp4').write_text('This is deliberately not a media container.\n')
print(root)
