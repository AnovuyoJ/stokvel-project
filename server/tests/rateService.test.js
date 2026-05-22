// file: server/tests/sarbRates.test.js

// Mock axios before requiring the service
jest.mock('axios');

// Mock node-cron to prevent actual scheduling during tests
jest.mock('node-cron', () => ({
  schedule: jest.fn()
}));

// Mock the Rate model
jest.mock('../models/rate', () => {
  // Create a mock constructor function
  const mockSave = jest.fn().mockResolvedValue(true);
  
  const MockRate = jest.fn().mockImplementation((data) => ({
    ...data,
    save: mockSave
  }));
  
  // Attach methods to the constructor if needed
  MockRate.find = jest.fn();
  MockRate.findOne = jest.fn();
  MockRate.findById = jest.fn();
  
  return MockRate;
});

const axios = require('axios');
const cron = require('node-cron');
const Rate = require('../models/rate');
const { fetchAndStoreSARBRates } = require('../services/sarbRates');

describe('SARB Rates Service', () => {
  // Sample SARB API response data
  const mockSARBResponse = {
    data: [
      {
        TimeseriesCode: "MMRD002A",
        Value: "8.25",
        Date: "2024-05-20T00:00:00",
        Description: "Repo rate"
      },
      {
        TimeseriesCode: "MMRD001A",
        Value: "11.75",
        Date: "2024-05-20T00:00:00",
        Description: "Prime lending rate"
      },
      {
        TimeseriesCode: "MMRD003A",
        Value: "6.50",
        Date: "2024-05-20T00:00:00",
        Description: "Other rate"
      }
    ]
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset the mock implementation for Rate constructor
    Rate.mockClear();
  });

  describe('fetchAndStoreSARBRates', () => {
    it('should fetch rates from SARB API and store them successfully', async () => {
      // Arrange
      axios.get.mockResolvedValue(mockSARBResponse);
      
      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledWith(
        'https://custom.resbank.co.za/SarbWebApi/WebIndicators/CurrentMarketRates'
      );
      
      // Verify Rate constructor was called with correct data
      expect(Rate).toHaveBeenCalledTimes(1);
      expect(Rate).toHaveBeenCalledWith({
        repoRate: 8.25,
        primeRate: 11.75, // 8.25 + 3.5
        effDate: new Date("2024-05-20T00:00:00"),
        lastUpdated: expect.any(Date)
      });
      
      // Verify save was called
      const mockRateInstance = Rate.mock.results[0].value;
      expect(mockRateInstance.save).toHaveBeenCalledTimes(1);
      
      // Verify result
      expect(result).toBeDefined();
      expect(result.repoRate).toBe(8.25);
      expect(result.primeRate).toBe(11.75);
    });

    it('should calculate prime rate as repo rate plus 3.5 percent', async () => {
      // Arrange
      const differentRateResponse = {
        data: [
          {
            TimeseriesCode: "MMRD002A",
            Value: "7.50",
            Date: "2024-05-20T00:00:00"
          }
        ]
      };
      axios.get.mockResolvedValue(differentRateResponse);

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(result.repoRate).toBe(7.50);
      expect(result.primeRate).toBe(11.00); // 7.50 + 3.5
    });

    it('should handle repo rate not found in response', async () => {
      // Arrange
      const responseWithoutRepo = {
        data: [
          {
            TimeseriesCode: "OTHER001",
            Value: "5.00",
            Date: "2024-05-20T00:00:00"
          }
        ]
      };
      axios.get.mockResolvedValue(responseWithoutRepo);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'repo rate not found, using last known data'
      );
      expect(Rate).not.toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle empty response from SARB API', async () => {
      // Arrange
      axios.get.mockResolvedValue({ data: [] });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle network errors from axios', async () => {
      // Arrange
      const networkError = new Error('Network Error');
      axios.get.mockRejectedValue(networkError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch SARB rates:',
        'Network Error'
      );
      expect(Rate).not.toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle API returning non-200 status', async () => {
      // Arrange
      const apiError = new Error('Request failed with status code 404');
      apiError.response = { status: 404 };
      axios.get.mockRejectedValue(apiError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle timeout errors', async () => {
      // Arrange
      const timeoutError = new Error('timeout of 5000ms exceeded');
      axios.get.mockRejectedValue(timeoutError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch SARB rates:',
        'timeout of 5000ms exceeded'
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle invalid rate values in API response', async () => {
      // Arrange
      const invalidRateResponse = {
        data: [
          {
            TimeseriesCode: "MMRD002A",
            Value: "invalid_number",
            Date: "2024-05-20T00:00:00"
          }
        ]
      };
      axios.get.mockResolvedValue(invalidRateResponse);

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      // parseFloat would return NaN, but prime rate would still be calculated
      expect(result.repoRate).toBeNaN();
      expect(result.primeRate).toBeNaN();
    });

    it('should handle missing Date field in API response', async () => {
      // Arrange
      const responseWithoutDate = {
        data: [
          {
            TimeseriesCode: "MMRD002A",
            Value: "8.25"
            // Date field missing
          }
        ]
      };
      axios.get.mockResolvedValue(responseWithoutDate);

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(result).toBeDefined();
      expect(result.repoRate).toBe(8.25);
      expect(result.effDate).toEqual(new Date(undefined)); // Invalid date
    });

    it('should handle database save errors', async () => {
      // Arrange
      axios.get.mockResolvedValue(mockSARBResponse);
      
      // Make save throw an error
      const mockSave = jest.fn().mockRejectedValue(new Error('Database connection failed'));
      Rate.mockImplementation((data) => ({
        ...data,
        save: mockSave
      }));
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });

    it('should set lastUpdated to current date when saving', async () => {
      // Arrange
      const beforeTest = new Date();
      axios.get.mockResolvedValue(mockSARBResponse);

      // Act
      const result = await fetchAndStoreSARBRates();
      const afterTest = new Date();

      // Assert
      expect(result.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeTest.getTime());
      expect(result.lastUpdated.getTime()).toBeLessThanOrEqual(afterTest.getTime());
    });

    it('should parse repo rate value as float', async () => {
      // Arrange
      const stringRateResponse = {
        data: [
          {
            TimeseriesCode: "MMRD002A",
            Value: "8.25",
            Date: "2024-05-20T00:00:00"
          }
        ]
      };
      axios.get.mockResolvedValue(stringRateResponse);

      // Act
      const result = await fetchAndStoreSARBRates();

      // Assert
      expect(typeof result.repoRate).toBe('number');
      expect(result.repoRate).toBe(8.25);
      expect(result.primeRate).toBe(11.75);
    });

    it('should handle different repo rates correctly', async () => {
      // Test various rate scenarios
      const testCases = [
        { input: "3.50", expectedRepo: 3.50, expectedPrime: 7.00 },
        { input: "5.00", expectedRepo: 5.00, expectedPrime: 8.50 },
        { input: "8.25", expectedRepo: 8.25, expectedPrime: 11.75 },
        { input: "10.00", expectedRepo: 10.00, expectedPrime: 13.50 },
        { input: "0.50", expectedRepo: 0.50, expectedPrime: 4.00 },
      ];

      for (const testCase of testCases) {
        // Arrange
        const response = {
          data: [
            {
              TimeseriesCode: "MMRD002A",
              Value: testCase.input,
              Date: "2024-05-20T00:00:00"
            }
          ]
        };
        axios.get.mockResolvedValue(response);

        // Act
        const result = await fetchAndStoreSARBRates();

        // Assert
        expect(result.repoRate).toBe(testCase.expectedRepo);
        expect(result.primeRate).toBe(testCase.expectedPrime);
        
        // Clear mocks for next iteration
        jest.clearAllMocks();
      }
    });
  });

  describe('Cron job scheduling', () => {
    it('should schedule cron job to run every 6 hours', () => {
      // Assert
      expect(cron.schedule).toHaveBeenCalledTimes(1);
      expect(cron.schedule).toHaveBeenCalledWith(
        '0 */6 * * *',
        expect.any(Function)
      );
    });

    it('should call fetchAndStoreSARBRates from cron job', async () => {
      // Get the cron callback function
      const cronCallback = cron.schedule.mock.calls[0][1];
      
      // Mock the API response
      axios.get.mockResolvedValue(mockSARBResponse);
      
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute the cron callback
      await cronCallback();

      // Verify it called the fetch function
      expect(consoleLogSpy).toHaveBeenCalledWith('Fetching SA Repo Rate from SARB API');
      expect(axios.get).toHaveBeenCalled();
      
      consoleLogSpy.mockRestore();
    });

    it('should handle errors in cron job gracefully', async () => {
      // Get the cron callback function
      const cronCallback = cron.schedule.mock.calls[0][1];
      
      // Mock a network error
      axios.get.mockRejectedValue(new Error('Network Error'));
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute the cron callback - should not throw
      await cronCallback();

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Module initialization', () => {
    it('should fetch rates immediately when module is loaded', () => {
      // The module calls fetchAndStoreSARBRates() at the top level
      // This is already tested by the fact that axios.get mock is called
      // We can verify the module behavior by checking if the mock was called
      
      // Re-require the module to test initialization behavior
      jest.isolateModules(() => {
        const freshAxios = require('axios');
        const freshCron = require('node-cron');
        const freshRate = require('../models/rate');
        
        require('../services/sarbRates');
        
        // Verify initial fetch was called
        // Note: This depends on how the module is structured
        expect(freshAxios.get).toHaveBeenCalled();
      });
    });
  });

  describe('API endpoint configuration', () => {
    it('should use the correct SARB API endpoint', async () => {
      // Arrange
      axios.get.mockResolvedValue(mockSARBResponse);

      // Act
      await fetchAndStoreSARBRates();

      // Assert
      const calledUrl = axios.get.mock.calls[0][0];
      expect(calledUrl).toBe(
        'https://custom.resbank.co.za/SarbWebApi/WebIndicators/CurrentMarketRates'
      );
    });

    it('should handle API endpoint changes or redirects', async () => {
      // This test ensures the function works even if the API structure changes
      // Arrange
      const alternativeResponseFormat = {
        data: {
          rates: [
            {
              code: "MMRD002A",
              value: "8.25",
              date: "2024-05-20T00:00:00"
            }
          ]
        }
      };
      axios.get.mockResolvedValue(alternativeResponseFormat);

      // Act & Assert
      // The function should handle this gracefully without crashing
      const result = await fetchAndStoreSARBRates();
      expect(result).toBeNull(); // Because TimeseriesCode property doesn't match
    });
  });
});