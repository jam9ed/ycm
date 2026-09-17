// Same as framedump, but takes a remote URL and samples N evenly spaced frames.
// AVURLAsset range-requests, so this reads a few hundred KB instead of the file.
// build: swiftc -O tools/framedump-url.swift -o tools/framedump-url
// usage: framedump-url <url> <outdir> <stem> <count> [maxWidth]
import AVFoundation
import AppKit

let a = CommandLine.arguments
guard a.count >= 5, let url = URL(string: a[1]) else { exit(2) }
let outDir = a[2], stem = a[3]
let count = Int(a[4]) ?? 6
let maxW = a.count > 5 ? Int(a[5]) ?? 320 : 320

let asset = AVURLAsset(url: url)
let dur = CMTimeGetSeconds(asset.duration)
guard dur.isFinite, dur > 0 else { print("\(stem)\tERR\tno-duration"); exit(1) }

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = CMTime(seconds: 0.4, preferredTimescale: 600)
gen.requestedTimeToleranceAfter  = CMTime(seconds: 0.4, preferredTimescale: 600)
gen.maximumSize = CGSize(width: maxW, height: 0)
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

var n = 0
for i in 0..<count {
    // skip the very start and end; titles and fumbling live there
    let t = dur * (0.10 + 0.80 * Double(i) / Double(max(count - 1, 1)))
    if let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil),
       let d = NSBitmapImageRep(cgImage: cg).representation(using: .jpeg, properties: [.compressionFactor: 0.8]) {
        let f = String(format: "%@@%02d.jpg", stem, i)
        try? d.write(to: URL(fileURLWithPath: outDir).appendingPathComponent(f))
        n += 1
    }
}
print("\(stem)\t\(String(format: "%.1f", dur))\t\(n)")
