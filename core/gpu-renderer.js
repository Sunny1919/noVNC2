/*
 * noVNC: HTML5 VNC client
 * GPU-Accelerated Rendering Module (WebGPU)
 * Copyright (C) 2024 The noVNC Authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * Provides GPU-accelerated rendering using WebGPU for smooth, high-performance display
 */

import * as Log from './util/logging.js';

export class GPURenderer {
    constructor() {
        this._enabled = false;
        this._device = null;
        this._context = null;
        this._pipeline = null;
        this._texture = null;
        this._sampler = null;
        this._canvas = null;
    }

    /**
     * Initialize WebGPU renderer
     * @param {HTMLCanvasElement} canvas - Target canvas element
     */
    async init(canvas) {
        if (!navigator.gpu) {
            Log.Warn('WebGPU not supported in this browser');
            return false;
        }

        try {
            this._canvas = canvas;

            // Request GPU adapter
            const adapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });

            if (!adapter) {
                Log.Warn('No WebGPU adapter available');
                return false;
            }

            // Request GPU device
            this._device = await adapter.requestDevice();

            // Configure canvas context
            this._context = canvas.getContext('webgpu');
            const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

            this._context.configure({
                device: this._device,
                format: canvasFormat,
                alphaMode: 'opaque',
            });

            // Create render pipeline
            await this._createPipeline(canvasFormat);

            // Create sampler for texture filtering
            this._sampler = this._device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                mipmapFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            });

            this._enabled = true;
            Log.Info('WebGPU renderer initialized successfully');
            return true;

        } catch (err) {
            Log.Error('Failed to initialize WebGPU renderer:', err);
            this._enabled = false;
            return false;
        }
    }

    /**
     * Create WebGPU render pipeline
     */
    async _createPipeline(format) {
        // Vertex shader - simple fullscreen quad
        const vertexShaderCode = `
            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) texCoord: vec2<f32>,
            };

            @vertex
            fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
                var pos = array<vec2<f32>, 6>(
                    vec2<f32>(-1.0, -1.0),
                    vec2<f32>(1.0, -1.0),
                    vec2<f32>(-1.0, 1.0),
                    vec2<f32>(-1.0, 1.0),
                    vec2<f32>(1.0, -1.0),
                    vec2<f32>(1.0, 1.0)
                );

                var texCoord = array<vec2<f32>, 6>(
                    vec2<f32>(0.0, 1.0),
                    vec2<f32>(1.0, 1.0),
                    vec2<f32>(0.0, 0.0),
                    vec2<f32>(0.0, 0.0),
                    vec2<f32>(1.0, 1.0),
                    vec2<f32>(1.0, 0.0)
                );

                var output: VertexOutput;
                output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
                output.texCoord = texCoord[vertexIndex];
                return output;
            }
        `;

        // Fragment shader - texture sampling with optional effects
        const fragmentShaderCode = `
            @group(0) @binding(0) var textureSampler: sampler;
            @group(0) @binding(1) var textureData: texture_2d<f32>;

            @fragment
            fn main(@location(0) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
                return textureSample(textureData, textureSampler, texCoord);
            }
        `;

        const vertexShaderModule = this._device.createShaderModule({
            code: vertexShaderCode,
        });

        const fragmentShaderModule = this._device.createShaderModule({
            code: fragmentShaderCode,
        });

        this._pipeline = this._device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: vertexShaderModule,
                entryPoint: 'main',
            },
            fragment: {
                module: fragmentShaderModule,
                entryPoint: 'main',
                targets: [{
                    format: format,
                }],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });
    }

    /**
     * Render image data to canvas using GPU
     * @param {ImageData} imageData - Image data to render
     */
    render(imageData) {
        if (!this._enabled || !imageData) {
            return false;
        }

        try {
            const { width, height } = imageData;

            // Create or update texture
            if (!this._texture || 
                this._texture.width !== width || 
                this._texture.height !== height) {
                
                if (this._texture) {
                    this._texture.destroy();
                }

                this._texture = this._device.createTexture({
                    size: { width, height },
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | 
                           GPUTextureUsage.COPY_DST | 
                           GPUTextureUsage.RENDER_ATTACHMENT,
                });
            }

            // Upload image data to texture
            this._device.queue.writeTexture(
                { texture: this._texture },
                imageData.data,
                { bytesPerRow: width * 4 },
                { width, height }
            );

            // Create bind group
            const bindGroup = this._device.createBindGroup({
                layout: this._pipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: this._sampler,
                    },
                    {
                        binding: 1,
                        resource: this._texture.createView(),
                    },
                ],
            });

            // Render
            const commandEncoder = this._device.createCommandEncoder();
            const textureView = this._context.getCurrentTexture().createView();

            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: textureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });

            renderPass.setPipeline(this._pipeline);
            renderPass.setBindGroup(0, bindGroup);
            renderPass.draw(6);
            renderPass.end();

            this._device.queue.submit([commandEncoder.finish()]);

            return true;

        } catch (err) {
            Log.Error('GPU render failed:', err);
            return false;
        }
    }

    /**
     * Check if GPU rendering is enabled
     */
    get enabled() {
        return this._enabled;
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this._texture) {
            this._texture.destroy();
            this._texture = null;
        }

        if (this._device) {
            this._device.destroy();
            this._device = null;
        }

        this._context = null;
        this._pipeline = null;
        this._sampler = null;
        this._canvas = null;
        this._enabled = false;
    }
}

// Singleton instance
let gpuRendererInstance = null;

export function getGPURenderer() {
    if (!gpuRendererInstance) {
        gpuRendererInstance = new GPURenderer();
    }
    return gpuRendererInstance;
}
