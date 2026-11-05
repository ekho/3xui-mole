package app

import (
	"errors"
	"os"
	"strconv"
)

func validatePanelRetryConfig() error {
	if value := os.Getenv("PANEL_DUPLICATE_GUARD_VERIFIED"); value != "" {
		enabled, err := strconv.ParseBool(value)
		if err != nil || enabled {
			return errors.New("PANEL_DUPLICATE_GUARD_VERIFIED must be false or unset: uncertain panel creates require operator recovery")
		}
	}
	return nil
}
