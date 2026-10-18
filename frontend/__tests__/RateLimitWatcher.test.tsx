import { act, render } from "@testing-library/react";
import RateLimitWatcher from "@/components/RateLimitWatcher";
import { RATE_LIMIT_WARNING_EVENT } from "@/lib/api/client";
import { useToast } from "@/components/Toast";

jest.mock("@/components/Toast", () => ({
  useToast: jest.fn(),
}));

const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockInfo = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();

/**
 * RateLimitWatcher reacts to the `ratelimit-warning` event dispatched by the
 * API client, which is driven by the standard `RateLimit-*` response headers
 * (Issue #1778). The deprecated `X-RateLimit-*` headers are not involved in
 * the pipeline at all — they are disabled server-side and never read here.
 */
describe("RateLimitWatcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseToast.mockReturnValue({
      success: mockSuccess,
      error: mockError,
      info: mockInfo,
    });
  });

  it("shows a toast when the ratelimit-warning event fires", () => {
    render(<RateLimitWatcher />);

    act(() => {
      window.dispatchEvent(new Event(RATE_LIMIT_WARNING_EVENT));
    });

    expect(mockInfo).toHaveBeenCalledWith(
      "Slowing down... API rate limit approaching.",
    );
  });

  it("throttles repeated warnings to at most one toast per 5 seconds", () => {
    render(<RateLimitWatcher />);

    act(() => {
      window.dispatchEvent(new Event(RATE_LIMIT_WARNING_EVENT));
      window.dispatchEvent(new Event(RATE_LIMIT_WARNING_EVENT));
      window.dispatchEvent(new Event(RATE_LIMIT_WARNING_EVENT));
    });

    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<RateLimitWatcher />);
    unmount();

    act(() => {
      window.dispatchEvent(new Event(RATE_LIMIT_WARNING_EVENT));
    });

    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("renders nothing (no visible UI)", () => {
    const { container } = render(<RateLimitWatcher />);
    expect(container).toBeEmptyDOMElement();
  });
});
