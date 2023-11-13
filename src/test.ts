interface TestConfig {
  name: string;
  shader: string;
  result: number;
}
const kTests: TestConfig[] = [
  {
    name: "select",
    shader: `
@group(0) @binding(0) var<storage, read_write> buffer: u32;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  buffer = select(0u, gid.x - 1000u, gid.x > 1000u);
}
`,
    result: 0,
  },
];

let adapter: GPUAdapter;
let device: GPUDevice;

const status_label = document.getElementById("status");
function SetStatus(status: string) {
  status_label.textContent = status;
}

async function Run() {
  SetStatus("Initializing...");
  if (!navigator.gpu) {
    SetStatus("WebGPU is not supported on this platform.");
    return;
  }

  adapter = await navigator.gpu.requestAdapter();
  device = await adapter.requestDevice();
  if (!device) {
    SetStatus("Failed to create WebGPU device.");
    return;
  }

  kTests.forEach((cfg: TestConfig) => {
    RunTest(cfg);
  });
  SetStatus(`${kTests.length} tests complete.`);
}

async function RunTest(cfg: TestConfig) {
  SetStatus(`Running '${cfg.name}'...`);

  // Compile the shader and create a compute pipeline.
  const module = device.createShaderModule({ code: cfg.shader });
  const pipeline = await device.createComputePipeline({
    compute: { module, entryPoint: "main" },
    layout: "auto",
  });

  // Create the buffer to hold the result, and a staging buffer to copy it back.
  const buffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  const staging = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  let data = new Uint32Array(buffer.getMappedRange());
  data[0] = 0xffffffff;
  buffer.unmap();

  // Dispatch the shader to the device.
  const commands = device.createCommandEncoder();
  const pass = commands.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      entries: [{ binding: 0, resource: { buffer } }],
      layout: pipeline.getBindGroupLayout(0),
    })
  );
  pass.dispatchWorkgroups(1);
  pass.end();
  commands.copyBufferToBuffer(buffer, 0, staging, 0, 4);
  device.queue.submit([commands.finish()]);

  // Read back the result.
  await staging.mapAsync(GPUMapMode.READ);
  let result = new Uint32Array(staging.getMappedRange());
  // TODO: Display result on page
  console.log(`result = ${result[0]}`);
  staging.unmap();
}

Run();
