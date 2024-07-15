export type WorkflowDefinitionType = 'txt2img' | 'img2img';
type WorkflowDefinitionKey = 'txt2img' | `${WorkflowDefinitionType}-${string}`;

export type WorkflowDefinition = {
  type: WorkflowDefinitionType;
  key: WorkflowDefinitionKey;
  name: string;
  description?: string;
  selectable?: boolean;
  template: string;
  enabled?: boolean;
  features?: (typeof workflowDefinitionFeatures)[number][];
  inputs?: InputSchema[];
  remix?: WorkflowDefinitionKey;
};

// TODO - these will need to be defined as an input schema first, then as a workflow input schema
type InputBase = {
  key: string;
  label: string;
  defaultValue: any;
  required: boolean;
};

type NumberInput = InputBase & {
  type: 'number';
  variant?: 'stepper' | 'slider';
  min?: number;
  max?: number;
  step?: number;
};

type TextInput = InputBase & {
  type: 'text';
  maxLength?: number;
  minLength?: number;
};

type SelectInput = InputBase & {
  type: 'select';
  options: { label: string; value: string }[];
};

type ImageInput = InputBase & {
  type: 'image';
  maxWidth?: number;
  maxHeight?: number;
  resizeToFit?: boolean;
};

export type InputSchema = NumberInput | TextInput | SelectInput | ImageInput;

export const workflowDefinitionLabel: Record<WorkflowDefinitionType, string> = {
  txt2img: 'Text-to-image',
  img2img: 'Image-to-image',
};
// upscale could require additional config options in the future, but this could also be tied to an input schema
export const workflowDefinitionFeatures = ['draft', 'denoise', 'upscale', 'image'] as const;
export const workflowDefinitions: WorkflowDefinition[] = [
  {
    type: 'txt2img',
    key: 'txt2img',
    name: '',
    features: ['draft'],
    template:
      '{"3": { "inputs": { "seed": {{seed}}, "steps": {{steps}}, "cfg": {{cfgScale}}, "sampler_name": "{{sampler}}", "scheduler": "{{scheduler}}", "denoise": 1.0, "model": [ "4", 0 ], "positive": [ "6", 0 ], "negative": [ "7", 0 ], "latent_image": [ "5", 0 ]}, "class_type": "KSampler" }, "4": { "inputs": { "ckpt_name": "placeholder.safetensors" }, "class_type": "CheckpointLoaderSimple" }, "5": { "inputs": { "width": {{width}}, "height": {{height}}, "batch_size": 1 }, "class_type": "EmptyLatentImage" }, "6": { "inputs": { "parser": "A1111", "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "ascore": 6.0, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "text_g": "", "text_l": "", "text": "{{prompt}}", "clip": [ "10", 0 ]}, "class_type": "smZ CLIPTextEncode" }, "7": { "inputs": { "parser": "A1111", "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "text_g": "", "text_l": "", "text": "{{negativePrompt}}", "clip": [ "10", 0 ]}, "class_type": "smZ CLIPTextEncode" }, "8": { "inputs": { "samples": [ "3", 0 ], "vae": [ "4", 2 ]}, "class_type": "VAEDecode" }, "9": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "8", 0 ]}, "class_type": "SaveImage" }, "10": { "inputs": { "stop_at_clip_layer": 0, "clip": [ "4", 1 ]}, "class_type": "CLIPSetLastLayer" }}',
  },
  {
    type: 'txt2img',
    key: 'txt2img-hires',
    name: 'Hi-res fix',
    description: 'Generate an image then upscale it and regenerate it',
    features: ['denoise', 'upscale'],
    template:
      '{ "3": { "inputs": { "seed": {{seed}}, "steps": {{steps}}, "cfg": {{cfgScale}}, "sampler_name": "{{sampler}}", "scheduler": "{{scheduler}}", "denoise": 1, "model": [ "16", 0 ], "positive": [ "6", 0 ], "negative": [ "7", 0 ], "latent_image": [ "5", 0 ] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } }, "5": { "inputs": { "width": {{width}}, "height": {{height}}, "batch_size": 1 }, "class_type": "EmptyLatentImage", "_meta": { "title": "Empty Latent Image" } }, "6": { "inputs": { "parser": "A1111", "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "text_g": "", "text_l": "", "text": "{{prompt}}", "clip": [ "16", 1 ] }, "class_type": "smZ CLIPTextEncode" }, "7": { "inputs": { "parser": "A1111", "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "text_g": "", "text_l": "", "text": "{{negativePrompt}}", "clip": [ "16", 1 ] }, "class_type": "smZ CLIPTextEncode" }, "8": { "inputs": { "samples": [ "3", 0 ], "vae": [ "16", 2 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } }, "9": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "8", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } }, "10": { "inputs": { "upscale_method": "nearest-exact", "width": {{upscaleWidth}}, "height": {{upscaleHeight}}, "crop": "disabled", "samples": [ "3", 0 ] }, "class_type": "LatentUpscale", "_meta": { "title": "Upscale Latent" } }, "11": { "inputs": { "seed": {{seed}}, "steps": {{steps}}, "cfg": {{cfgScale}}, "sampler_name": "{{sampler}}", "scheduler": "simple", "denoise": {{denoise}}, "model": [ "16", 0 ], "positive": [ "6", 0 ], "negative": [ "7", 0 ], "latent_image": [ "10", 0 ] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } }, "12": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "13", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } }, "13": { "inputs": { "samples": [ "11", 0 ], "vae": [ "16", 2 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } }, "16": { "inputs": { "ckpt_name": "placeholder.safetensors" }, "class_type": "CheckpointLoaderSimple", "_meta": { "title": "Load Checkpoint" } } }',
  },
  {
    type: 'txt2img',
    key: 'txt2img-facefix',
    name: 'Face fix',
    description: 'Generate an image then find and regenerate faces',
    features: ['denoise'],
    template:
      '{ "5": { "inputs": { "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "parser": "A1111", "text_g": "", "text_l": "", "text": "{{prompt}}", "clip": [ "54", 1 ] }, "class_type": "smZ CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Prompt)" } }, "6": { "inputs": { "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "parser": "A1111", "text_g": "", "text_l": "", "text": "{{negativePrompt}}", "clip": [ "54", 1 ] }, "class_type": "smZ CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Prompt)" } }, "16": { "inputs": { "model_name": "urn:air:other:other:civitai-r2:civitai-worker-assets@sam_vit_b_01ec64.pth", "device_mode": "AUTO" }, "class_type": "SAMLoader", "_meta": { "title": "SAMLoader (Impact)" } }, "28": { "inputs": { "seed": {{seed}}, "steps": {{steps}}, "cfg": {{cfgScale}}, "sampler_name": "{{sampler}}", "scheduler": "{{scheduler}}", "denoise": 1, "model": [ "54", 0 ], "positive": [ "5", 0 ], "negative": [ "6", 0 ], "latent_image": [ "29", 0 ] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } }, "29": { "inputs": { "width": {{width}}, "height": {{height}}, "batch_size": 1 }, "class_type": "EmptyLatentImage", "_meta": { "title": "Empty Latent Image" } }, "30": { "inputs": { "samples": [ "28", 0 ], "vae": [ "54", 2 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } }, "51": { "inputs": { "guide_size": 360, "guide_size_for": "bbox", "max_size": 768, "seed": {{seed}}, "steps": {{steps}}, "cfg": {{cfgScale}}, "sampler_name": "{{sampler}}", "scheduler": "{{scheduler}}", "denoise": {{denoise}}, "feather": 5, "noise_mask": "enabled", "force_inpaint": "disabled", "bbox_threshold": 0.5, "bbox_dilation": 15, "bbox_crop_factor": 3, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7000000000000001, "sam_mask_hint_use_negative": "False", "drop_size": 10, "wildcard": "", "cycle": 1, "inpaint_model": false, "noise_mask_feather": 20, "image": [ "30", 0 ], "model": [ "54", 0 ], "clip": [ "54", 1 ], "vae": [ "54", 2 ], "positive": [ "5", 0 ], "negative": [ "6", 0 ], "bbox_detector": [ "53", 0 ], "sam_model_opt": [ "16", 0 ] }, "class_type": "FaceDetailer", "_meta": { "title": "FaceDetailer" } }, "53": { "inputs": { "model_name": "urn:air:other:other:civitai-r2:civitai-worker-assets@face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider", "_meta": { "title": "UltralyticsDetectorProvider" } }, "54": { "inputs": { "ckpt_name": "placeholder.safetensors" }, "class_type": "CheckpointLoaderSimple", "_meta": { "title": "Load Checkpoint" } }, "55": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "51", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } }, "56": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "30", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } } }',
  },
  {
    type: 'txt2img',
    key: 'txt2img-hires-facefix',
    name: 'Hi-res face fix',
    description: 'Generate an image then upscale it, regenerate, find and regenerate faces',
    features: ['denoise', 'upscale'],
    template:
      '{ "3": { "inputs": { "seed": "{{{seed}}}", "steps": "{{{steps}}}", "cfg": "{{{cfgScale}}}", "sampler_name": "{{sampler}}", "scheduler": "{{scheduler}}", "denoise": 1, "model": [ "68", 0 ], "positive": [ "6", 0 ], "negative": [ "7", 0 ], "latent_image": [ "5", 0 ] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } }, "5": { "inputs": { "width": "{{{width}}}", "height": "{{{height}}}", "batch_size": 1 }, "class_type": "EmptyLatentImage", "_meta": { "title": "Empty Latent Image" } }, "6": { "inputs": { "text": "{{prompt}}", "parser": "A1111", "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "text_g": "", "text_l": "", "smZ_steps": 1, "clip": [ "68", 1 ] }, "class_type": "smZ CLIPTextEncode", "_meta": { "title": "CLIP Text Encode++" } }, "7": { "inputs": { "text": "{{negativePrompt}}", "parser": "A1111", "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "text_g": "", "text_l": "", "smZ_steps": 1, "clip": [ "68", 1 ] }, "class_type": "smZ CLIPTextEncode", "_meta": { "title": "CLIP Text Encode++" } }, "8": { "inputs": { "samples": [ "3", 0 ], "vae": [ "68", 2 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } }, "9": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "8", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } }, "10": { "inputs": { "upscale_method": "nearest-exact", "width": "{{{upscaleWidth}}}", "height": "{{{upscaleHeight}}}", "crop": "disabled", "samples": [ "3", 0 ] }, "class_type": "LatentUpscale", "_meta": { "title": "Upscale Latent" } }, "11": { "inputs": { "seed": "{{{seed}}}", "steps": "{{{steps}}}", "cfg": "{{{cfgScale}}}", "sampler_name": "{{sampler}}", "scheduler": "{{scheduler}}", "denoise": "{{{denoise}}}", "model": [ "68", 0 ], "positive": [ "6", 0 ], "negative": [ "7", 0 ], "latent_image": [ "10", 0 ] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } }, "12": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "13", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } }, "13": { "inputs": { "samples": [ "11", 0 ], "vae": [ "68", 2 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } }, "14": { "inputs": { "guide_size": 384, "guide_size_for": true, "max_size": 1024, "seed": "{{{seed}}}", "steps": "{{{steps}}}", "cfg": "{{{cfgScale}}}", "sampler_name": "{{sampler}}", "scheduler": "{{scheduler}}", "denoise": 0.4, "feather": 5, "noise_mask": true, "force_inpaint": true, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "wildcard": "", "cycle": 1, "inpaint_model": false, "noise_mask_feather": 20, "image": [ "13", 0 ], "model": [ "68", 0 ], "clip": [ "68", 1 ], "vae": [ "68", 2 ], "positive": [ "15", 0 ], "negative": [ "16", 0 ], "bbox_detector": [ "18", 0 ], "sam_model_opt": [ "17", 0 ] }, "class_type": "FaceDetailer", "_meta": { "title": "FaceDetailer" } }, "15": { "inputs": { "text": "a face", "clip": [ "68", 1 ] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Prompt)" } }, "16": { "inputs": { "text": "worst quality, low quality, normal quality, lowres, normal quality, monochrome, grayscale", "clip": [ "68", 1 ] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Prompt)" } }, "17": { "inputs": { "model_name": "urn:air:other:other:civitai-r2:civitai-worker-assets@sam_vit_b_01ec64.pth", "device_mode": "AUTO" }, "class_type": "SAMLoader", "_meta": { "title": "SAMLoader (Impact)" } }, "18": { "inputs": { "model_name": "urn:air:other:other:civitai-r2:civitai-worker-assets@face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider", "_meta": { "title": "UltralyticsDetectorProvider" } }, "19": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "14", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } }, "20": { "inputs": { "images": [ "14", 2 ] }, "class_type": "PreviewImage", "_meta": { "title": "Preview Image" } }, "68": { "inputs": { "ckpt_name": "placeholder.safetensors" }, "class_type": "CheckpointLoaderSimple", "_meta": { "title": "Load Checkpoint" } } }',
  },
  {
    type: 'img2img',
    key: 'img2img-hires',
    name: 'Hi-res fix',
    description: 'Upscale and regenerate the image',
    features: ['denoise', 'upscale', 'image'],
    template:
      '{ "6": { "inputs": { "parser": "A1111", "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "text_g": "", "text_l": "", "text": "{{prompt}}", "clip": [ "16", 1 ] }, "class_type": "smZ CLIPTextEncode", "_meta": { "title": "Positive" } }, "7": { "inputs": { "parser": "A1111", "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "text_g": "", "text_l": "", "text": "{{negativePrompt}}", "clip": [ "16", 1 ] }, "class_type": "smZ CLIPTextEncode", "_meta": { "title": "Negative" } }, "10": { "inputs": { "upscale_method": "nearest-exact", "width": {{upscaleWidth}}, "height": {{upscaleHeight}}, "crop": "disabled", "samples": [ "18", 0 ] }, "class_type": "LatentUpscale", "_meta": { "title": "Upscale Latent" } }, "11": { "inputs": { "seed": {{seed}}, "steps": {{steps}}, "cfg": {{cfgScale}}, "sampler_name": "{{sampler}}", "scheduler": "simple", "denoise": {{denoise}}, "model": [ "16", 0 ], "positive": [ "6", 0 ], "negative": [ "7", 0 ], "latent_image": [ "10", 0 ] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } }, "12": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "13", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } }, "13": { "inputs": { "samples": [ "11", 0 ], "vae": [ "16", 2 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } }, "16": { "inputs": { "ckpt_name": "placeholder.safetensors" }, "class_type": "CheckpointLoaderSimple", "_meta": { "title": "Load Checkpoint" } }, "17": { "inputs": { "image": "{{image}}", "upload": "image" }, "class_type": "LoadImage", "_meta": { "title": "Image Load" } }, "18": { "inputs": { "pixels": [ "17", 0 ], "vae": [ "16", 2 ] }, "class_type": "VAEEncode", "_meta": { "title": "VAE Encode" } } }',
  },
  {
    type: 'img2img',
    key: 'img2img-facefix',
    name: 'Face fix',
    description: 'Find and regenerate faces in the image',
    features: ['denoise', 'image'],
    template:
      '{ "5": { "inputs": { "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "parser": "A1111", "text_g": "", "text_l": "", "text": "{{prompt}}", "clip": [ "54", 1 ] }, "class_type": "smZ CLIPTextEncode", "_meta": { "title": "Positive" } }, "6": { "inputs": { "ascore": 2.5, "width": 0, "height": 0, "crop_w": 0, "crop_h": 0, "target_width": 0, "target_height": 0, "mean_normalization": true, "multi_conditioning": true, "use_old_emphasis_implementation": false, "with_SDXL": false, "parser": "A1111", "text_g": "", "text_l": "", "text": "{{negativePrompt}}", "clip": [ "54", 1 ] }, "class_type": "smZ CLIPTextEncode", "_meta": { "title": "Negative" } }, "16": { "inputs": { "model_name": "urn:air:other:other:civitai-r2:civitai-worker-assets@sam_vit_b_01ec64.pth", "device_mode": "AUTO" }, "class_type": "SAMLoader", "_meta": { "title": "SAMLoader (Impact)" } }, "51": { "inputs": { "guide_size": 360, "guide_size_for": "bbox", "max_size": 768, "seed": {{seed}}, "steps": {{steps}}, "cfg": {{cfgScale}}, "sampler_name": "{{sampler}}", "scheduler": "{{scheduler}}", "denoise": {{denoise}}, "feather": 5, "noise_mask": "enabled", "force_inpaint": "disabled", "bbox_threshold": 0.5, "bbox_dilation": 15, "bbox_crop_factor": 3, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7000000000000001, "sam_mask_hint_use_negative": "False", "drop_size": 10, "wildcard": "", "cycle": 1, "inpaint_model": false, "noise_mask_feather": 20, "image": [ "56", 0 ], "model": [ "54", 0 ], "clip": [ "54", 1 ], "vae": [ "54", 2 ], "positive": [ "5", 0 ], "negative": [ "6", 0 ], "bbox_detector": [ "53", 0 ], "sam_model_opt": [ "16", 0 ] }, "class_type": "FaceDetailer", "_meta": { "title": "FaceDetailer" } }, "53": { "inputs": { "model_name": "urn:air:other:other:civitai-r2:civitai-worker-assets@face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider", "_meta": { "title": "UltralyticsDetectorProvider" } }, "54": { "inputs": { "ckpt_name": "placeholder.safetensors" }, "class_type": "CheckpointLoaderSimple", "_meta": { "title": "Load Checkpoint" } }, "56": { "inputs": { "image": "{{image}}", "upload": "image" }, "class_type": "LoadImage", "_meta": { "title": "Load Image" } }, "58": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "51", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } } }',
  },
  {
    type: 'img2img',
    key: 'img2img-upscale',
    name: 'Upscale',
    features: ['upscale', 'image'],
    selectable: false,
    remix: 'txt2img',
    template:
      '{"12": { "inputs": { "filename_prefix": "ComfyUI", "images": [ "24", 0 ]}, "class_type": "SaveImage", "_meta": { "title": "Save Image" }}, "22": { "inputs": { "upscale_model": [ "23", 0 ], "image": [ "26", 0 ]}, "class_type": "ImageUpscaleWithModel", "_meta": { "title": "Upscale Image (using Model)" }}, "23": { "inputs": { "model_name": "urn:air:multi:upscaler:civitai:147759@164821" }, "class_type": "UpscaleModelLoader", "_meta": { "title": "Load Upscale Model" }}, "24": { "inputs": { "upscale_method": "bilinear", "width": {{upscaleWidth}}, "height": {{upscaleHeight}}, "crop": "disabled", "image": [ "22", 0 ]}, "class_type": "ImageScale", "_meta": { "title": "Upscale Image" }}, "26": { "inputs": { "image": "{{image}}", "upload": "image" }, "class_type": "LoadImage", "_meta": { "title": "Load Image" }}}',
  },
];
