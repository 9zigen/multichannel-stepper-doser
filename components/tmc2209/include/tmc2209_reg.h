#include <stdio.h>

/* Registers */
// GCONF : RW
typedef union {
    uint32_t value;
    struct {
        uint32_t
            I_scale_analog   :1,
            internal_Rsense  :1,
            en_spreadcycle   :1,
            shaft            :1,
            index_otpw       :1,
            index_step       :1,
            pdn_disable      :1,
            mstep_reg_select :1,
            multistep_filt   :1,
            test_mode        :1,
            reserved         :22;
    };
} tmc2209_gconf_reg_t;

// GSTAT : R+C
typedef union {
    uint32_t value;
    struct {
        uint32_t
            reset    :1,
            drv_err  :1,
            uv_cp    :1,
            reserved :29;
    };
} tmc2209_gstat_reg_t;

// IFCNT : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            count    :8,
            reserved :24;
    };
} tmc2209_ifcnt_reg_t;

// NODECONF : W
typedef union {
    uint32_t value;
    struct {
        uint32_t
            reserved0 :8,
            conf      :4,
            reserved1 :20;
    };
} tmc2209_nodeconf_reg_t;

// OTP_PROG : W
typedef union {
    uint32_t value;
    struct {
        uint32_t
            otpbit   :2,
            otpbyte  :2,
            otpmagic :28;
    };
} tmc2209_otp_prog_reg_t;

// OTP_READ : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            otp_fclktrim               :5,
            otp_ottrim                 :1,
            otp_internalrsense         :1,
            otp_tbl                    :1,
            otp_pwm_grad_chopconf0_3   :4,
            otp_pwm_autograd_chopconf4 :1,
            otp_tpwmthrs_chopconf5_7   :3,
            otp_pwm_ofs_chopconf8      :1,
            otp_pwm_reg                :1,
            otp_pwm_freq               :1,
            otp_iholddelay             :2,
            otp_ihold                  :2,
            otp_en_spreadcycle         :1,
            reserved                   :8;
    };
} tmc2209_otp_read_reg_t;

// IOIN : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            enn       :1,
            unused0   :1,
            ms1       :1,
            ms2       :1,
            diag      :1,
            unused1   :1,
            pdn_uart  :1,
            step      :1,
            sel_a     :1,
            dir       :1,
            reserved  :14,
            version   :8;
    };
} tmc2209_ioin_reg_t;

// FACTORY_CONF : RW
typedef union {
    uint32_t value;
    struct {
        uint32_t
            fclktrim  :4,
            reserved1 :3,
            ottrim    :2,
            reserved :23;
    };
} tmc2209_factory_conf_reg_t;

// IHOLD_IRUN : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            ihold      :5,
            reserved1  :3,
            irun       :5,
            reserved2  :3,
            iholddelay :4,
            reserved3  :12;
    };
} tmc2209_ihold_irun_reg_t;

// TPOWERDOWN : W
typedef union {
    uint32_t value;
    struct {
        uint32_t
            tpowerdown :8,
            reserved   :24;
    };
} tmc2209_tpowerdown_reg_t;

// TSTEP : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            tstep    :20,
            reserved :12;
    };
} tmc2209_tstep_reg_t;

// TPWMTHRS : W
typedef union {
    uint32_t value;
    struct {
        uint32_t
            tpwmthrs :20,
            reserved :12;
    };
} tmc2209_tpwmthrs_reg_t;

// VACTUAL : W
typedef union {
    uint32_t value;
    struct {
        uint32_t
            actual   :24,
            reserved :8;
    };
} tmc2209_vactual_reg_t;

// MSCNT : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            mscnt    :10,
            reserved :22;
    };
} tmc2209_mscnt_reg_t;

// MSCURACT : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            cur_a     :9,
            reserved1 :7,
            cur_b     :9,
            reserved2 :7;
    };
} tmc2209_mscuract_reg_t;

// CHOPCONF : RW
typedef union {
    uint32_t value;
    struct {
        uint32_t
            toff      :4,
            hstrt     :3,
            hend      :4,
            reserved0 :4,
            tbl       :2,
            vsense    :1,
            reserved1 :6,
            mres      :4,
            intpol    :1,
            dedge     :1,
            diss2g    :1,
            diss2vs   :1;
    };
} tmc2209_chopconf_reg_t;

// DRV_STATUS : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            otpw       :1,
            ot         :1,
            s2ga       :1,
            s2gb       :1,
            s2vsa      :1,
            s2vsb      :1,
            ola        :1,
            olb        :1,
            t120       :1,
            t143       :1,
            t150       :1,
            t157       :1,
            reserved1  :4,
            cs_actual  :5,
            reserved2  :3,
            reserved3  :6,
            stealth    :1,
            stst       :1;
    };
} tmc2209_drv_status_reg_t;

// PWMCONF : RW
typedef union {
    uint32_t value;
    struct {
        uint32_t
            pwm_ofs       :8,
            pwm_grad      :8,
            pwm_freq      :2,
            pwm_autoscale :1,
            pwm_autograd  :1,
            freewheel     :2,
            reserved      :2,
            pwm_reg       :4,
            pwm_lim       :4;
    };
} tmc2209_pwmconf_reg_t;

// PWM_SCALE : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            pwm_scale_sum  :8,
            reserved1      :8,
            pwm_scale_auto :9, // signed 9 Bit value!
            reserved2      :7;
    };
} tmc2209_pwm_scale_reg_t;

// PWM_AUTO : R
typedef union {
    uint32_t value;
    struct {
        uint32_t
            pwm_ofs_auto  :8,
            unused0       :8,
            pwm_grad_auto :8,
            unused1       :8;
    };
} tmc2209_pwm_auto_reg_t;