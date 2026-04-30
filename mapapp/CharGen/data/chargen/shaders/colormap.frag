#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D texture;
uniform vec4 palette[256];

void main(void)
{
    // lookup the pixel in the texture
    vec4 pixel = texture2D(texture, gl_TexCoord[0].xy);
    vec4 opixel = vec4(palette[int(pixel.r * 255)].rgb, pixel.a);
    //vec4 opixel = palette[int(pixel.r * 255)];
    gl_FragColor = opixel;
}
