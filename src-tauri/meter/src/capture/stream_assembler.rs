use super::packet_accumulator::PacketAccumulator;
use super::stream_processor::StreamProcessor;
use super::tcp_order::TcpOrder;

/// Reassembles TCP stream fragments and feeds complete data to the StreamProcessor.
pub struct StreamAssembler {
    accumulator: PacketAccumulator,
    /// Companion: the segments in sequence order (`tcp_order.rs`).
    order: TcpOrder,
}

impl StreamAssembler {
    pub fn new() -> Self {
        Self {
            accumulator: PacketAccumulator::new(),
            order: TcpOrder::default(),
        }
    }

    /// Companion: a TCP segment by its sequence number, put back in stream order first (`tcp_order.rs`);
    /// `None` (no sequence number known) reads it as it comes, as `process_chunk` does.
    pub fn process_segment(&mut self, seq: Option<u32>, data: &[u8], now_ms: i64, processor: &mut StreamProcessor) -> bool {
        let Some(seq) = seq else {
            self.order = TcpOrder::default();
            return self.process_chunk(data, processor);
        };
        let mut parsed = false;
        for chunk in self.order.push(seq, data, now_ms) {
            parsed |= self.process_chunk(&chunk, processor);
        }
        parsed
    }

    /// Process a TCP chunk. Returns true if any packets were successfully parsed.
    pub fn process_chunk(&mut self, data: &[u8], processor: &mut StreamProcessor) -> bool {
        self.accumulator.append(data);
        let mut parsed_any = false;

        loop {
            if self.accumulator.size() == 0 {
                break;
            }

            let snapshot = self.accumulator.snapshot().to_vec();
            let consumed = processor.consume_stream(&snapshot);

            if consumed > 0 {
                self.accumulator.discard_bytes(consumed);
                parsed_any = true;
            } else {
                break;
            }
        }

        parsed_any
    }

    pub fn buffered_bytes(&self) -> usize {
        self.accumulator.size()
    }
}
