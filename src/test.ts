interface TestConfig {
  name: string;
  code: string;
  expected: number;
}
const kTests: TestConfig[] = [
  {
    name: "select",
    code: "buffer = select(0u, gid.x - 1000u, gid.x > 1000u);",
    expected: 0,
  },
  {
    name: "add_sub_min",
    code: "buffer = (zero + gid.x) - min(gid.x, 1000u);",
    expected: 0,
  },
  {
    name: "x_sub_min",
    code: "buffer = gid.x - min(1000u, gid.x);",
    expected: 0,
  },
  {
    name: "c_sub_max",
    code: "buffer = 1000u - max(gid.x, 1000u);",
    expected: 0,
  },
  {
    name: "min_sub_x",
    code: "buffer = min(1000u, gid.x) - gid.x;",
    expected: 0,
  },
  {
    name: "max_sub_c",
    code: "buffer = max(gid.x, 1000u) - 1000u;",
    expected: 0,
  },
];

let adapter: GPUAdapter;
let device: GPUDevice;
let markdown_results: string;

const status_label = document.getElementById("status");
function SetStatus(status: string) {
  status_label.textContent = status;
}

const kNameLength: number = 12;
const kExpectedLength: number = 10;
const kGotLength: number = 10;
const kPassLength: number = 4;

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

  markdown_results = `| ${"Name".padEnd(kNameLength)} | ${"Expected".padEnd(
    kExpectedLength
  )} | ${"Got".padEnd(kGotLength)} | ${"Pass".padEnd(kPassLength)} |\n`;
  markdown_results += `| ${"-".repeat(kNameLength)} | ${"-".repeat(kExpectedLength)} | ${"-".repeat(
    kGotLength
  )} | ${"-".repeat(kPassLength)} |`;

  kTests.forEach((cfg: TestConfig) => {
    RunTest(cfg);
  });
  SetStatus(`${kTests.length} tests complete.`);
}

async function RunTest(cfg: TestConfig) {
  SetStatus(`Running '${cfg.name}'...`);

  // Compile the shader and create a compute pipeline.
  const code = `
@group(0) @binding(0) var<storage, read_write> buffer: u32;
@group(0) @binding(1) var<uniform> zero: u32;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  _ = zero;
  ${cfg.code}
}
`;
  const module = device.createShaderModule({ code });
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
  data[0] = 0xdeadbeef;
  buffer.unmap();

  const zero = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });
  {
    let data = new Uint32Array(zero.getMappedRange());
    data[0] = 0;
    zero.unmap();
  }

  // Dispatch the shader to the device.
  const commands = device.createCommandEncoder();
  const pass = commands.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: { buffer: zero } },
      ],
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
  let got = result[0];
  staging.unmap();

  const passed = cfg.expected === got;

  const table = document.getElementById("table");
  let row = "<tr>";
  row += `<td>${cfg.name}</td>`;
  row += `<td>${cfg.expected}</td>`;
  row += `<td>${got}</td>`;
  row += `<td style="color: ${passed ? "green" : "red"}">${passed ? "Pass" : "Fail"}</td>`;
  row += "</tr>";
  table.innerHTML += row;

  markdown_results += `\n| ${cfg.name.padEnd(kNameLength)} | ${cfg.expected
    .toString()
    .padEnd(kExpectedLength)} | ${got.toString().padEnd(kGotLength)} | ${(passed
    ? "Pass"
    : "FAIL"
  ).padEnd(kPassLength)} |`;
}

document.getElementById("copy-results").addEventListener("click", () => {
  navigator.clipboard.writeText("```\n" + markdown_results + "\n```");
  document.getElementById("copied").style.display = "";
});

Run();
