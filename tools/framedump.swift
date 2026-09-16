// Dumps frames from a video at a fixed interval, small and fast, so the reel
// can be analysed for where in the frame the boat actually is.
// build:  swiftc -O tools/framedump.swift -o tools/framedump
// usage:  framedump <video> <outdir> <interval-seconds> [maxWidth]
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 4 else {
    FileHandle.standardError.write("usage: framedump <video> <outdir> <interval> [maxWidth]\n".data(using: .utf8)!)
    exit(2)
}
let url = URL(fileURLWithPath: args[1])
let outDir = args[2]
let interval = Double(args[3]) ?? 2.0
let maxW = args.count > 4 ? Int(args[4]) ?? 320 : 320

let asset = AVURLAsset(url: url)
let dur = CMTimeGetSeconds(asset.duration)
guard dur.isFinite, dur > 0 else {
    FileHandle.standardError.write("could not read duration\n".data(using: .utf8)!)
    exit(1)
}

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = CMTime(seconds: 0.05, preferredTimescale: 600)
gen.requestedTimeToleranceAfter  = CMTime(seconds: 0.05, preferredTimescale: 600)
gen.maximumSize = CGSize(width: maxW, height: 0)

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
let stem = url.deletingPathExtension().lastPathComponent

var t = 0.0
var n = 0
while t < dur {
    let time = CMTime(seconds: t, preferredTimescale: 600)
    if let cg = try? gen.copyCGImage(at: time, actualTime: nil) {
        let rep = NSBitmapImageRep(cgImage: cg)
        if let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) {
            let name = String(format: "%@@%07.2f.jpg", stem, t)
            try? data.write(to: URL(fileURLWithPath: outDir).appendingPathComponent(name))
            n += 1
        }
    }
    t += interval
}
print("\(stem) duration=\(String(format: "%.1f", dur))s frames=\(n)")
